// npm run eval -- --all --split dev [--name n]          every Jev variant, compared at the end
// npm run eval -- --suite e2e --variant baseline,strict  only some suites or variants
// npm run eval -- --all --split test --final             (once, at the end; ships its Jev cache)
//   --variant a,b    Jev variants from src/domain/jev/variants.ts (default: all but `demo`)
//   --offline        answer only from the cache (no Jev key needed, no spend)
//   --limit N        first N cases per suite (smoke runs)
//   --concurrency N  parallel cases (default 8)
//   --thresholds f   JSON Thresholds instead of the variant's own (one variant only)
//   --name n         also save each variant as snapshot eval/snapshots/<n>.<variant>
//   --force          replace existing snapshots of that name
//   --cache f        Jev cache file (default eval/data/cache/jev.jsonl); pass a final run's
//                    jev-cache.jsonl with --offline to reproduce it without a Jev key
//
// Variants that ask the same questions share one pass over Jev (and its answers): their
// differences then come from the decision settings alone, which makes the comparison paired.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHttpJevClient } from '../../src/adapters/jev/jev-client';
import { loadConfig } from '../../src/config';
import type { Thresholds } from '../../src/domain/decision/decide';
import {
  JEV_VARIANT_IDS,
  JEV_VARIANTS,
  type JevQuestionSets,
  type JevVariantId,
} from '../../src/domain/jev/variants';
import { EvalCaseSchema, SplitSchema, SuiteSchema, type EvalCase } from '../cases';
import { createCachedFetch, questionsHash } from '../jev-cache';
import { readJsonl, writeJson } from '../jsonl';
import { percentile } from '../metrics';
import { PATHS } from '../paths';
import { summarize, toMarkdown } from '../report';
import { runCases, type CaseRecord } from '../runner';
import { saveSnapshot } from '../snapshots';
import { compareVariants, type VariantResult } from '../variants';
import { fail, gitState, parseArgs, runId } from './args';

/** USD per million input tokens (TypeSafe Jev pricing; output is free). */
const PRICE_PER_M_INPUT = 0.042;

const args = parseArgs();
const split = SplitSchema.parse(args.get('split') ?? 'dev');
const final = args.has('final');
if (split === 'test' && !final)
  fail('The test split is locked. Run it once, at the end, with --final.');
if (final && split !== 'test') fail('--final is only for the test split.');
const suites = args.has('all')
  ? SuiteSchema.options
  : (args.get('suite') ?? fail('Pass --suite <name>[,<name>…] or --all.'))
      .split(',')
      .map((name) => SuiteSchema.parse(name.trim()));
// The demo variant is tuned to two pitch offers; it runs only when asked for by name.
const evaluated = JEV_VARIANT_IDS.filter((id) => id !== 'demo');
const variantIds = (args.get('variant')?.split(',') ?? evaluated).map((id) => {
  const trimmed = id.trim();
  if (!(trimmed in JEV_VARIANTS))
    fail(`Unknown variant "${trimmed}". Known: ${JEV_VARIANT_IDS.join(', ')}`);
  return trimmed as JevVariantId;
});
if (args.get('thresholds') && variantIds.length !== 1)
  fail("--thresholds replaces one variant's settings: pass a single --variant.");
const thresholdsOf = (id: JevVariantId): Thresholds =>
  args.get('thresholds')
    ? (JSON.parse(readFileSync(args.get('thresholds')!, 'utf8')) as Thresholds)
    : JEV_VARIANTS[id].thresholds;

// Check snapshot names before spending time and Jev calls on the run.
const snapshotName = args.get('name');
const snapshotOf = (id: JevVariantId) => `${snapshotName}.${id}`;
for (const id of snapshotName ? variantIds : []) {
  if (existsSync(join(PATHS.snapshots, snapshotOf(id))) && !args.has('force')) {
    fail(`Snapshot "${snapshotOf(id)}" exists; pick another --name or pass --force.`);
  }
}

const offline = args.has('offline');
const config = offline ? undefined : loadConfig();
if (!offline && !config?.jev) fail('JEV_API_KEY is not set (or use --offline).');
const jevConfig = config?.jev ?? {
  url: 'https://offline.invalid',
  apiKey: 'offline',
  model: process.env.JEV_MODEL || 'jev-1.13.0',
  timeoutMs: 10_000,
};

const cacheFile = args.get('cache') ?? join(PATHS.cache, 'jev.jsonl');
const cache = createCachedFetch({ file: cacheFile, offline });

const limit = args.get('limit') ? Number(args.get('limit')) : Infinity;
const cases: EvalCase[] = suites.flatMap((suite) =>
  readJsonl(join(PATHS.cases, `${suite}.jsonl`), EvalCaseSchema)
    .filter((c) => c.split === split)
    .slice(0, limit),
);
if (cases.length === 0) fail('No cases: run npm run eval:build (and check the split).');

const hashes = (q: JevQuestionSets) => ({
  screenQuestions: questionsHash(q.screen),
  judgeQuestions: questionsHash(q.judge),
});

/** One Jev pass per distinct question set. */
interface Pass {
  questions: JevQuestionSets;
  records: CaseRecord[];
  stats: { calls: number; newCalls: number; inputTokens: number; latencies: number[] };
}
const passes = new Map<string, Pass>();
console.log(
  `${cases.length} ${split} cases · ${suites.join(', ')} · Jev ${jevConfig.model} · variants ${variantIds.join(', ')}`,
);
for (const id of variantIds) {
  const questions = JEV_VARIANTS[id].questions;
  const key = JSON.stringify(hashes(questions));
  if (passes.has(key)) continue;
  const usedBefore = new Set(cache.stats.used);
  const missesBefore = cache.stats.misses;
  const jev = createHttpJevClient(jevConfig, cache.fetch, questions);
  process.stdout.write(`questions for ${id}: `);
  const records = await runCases(cases, jev, {
    concurrency: Number(args.get('concurrency') ?? 8),
    onProgress: (done) => {
      if (done % 25 === 0 || done === cases.length)
        process.stdout.write(`\rquestions for ${id}: ${done}/${cases.length}`);
    },
  });
  console.log();
  const used = [...cache.stats.used]
    .filter((k) => !usedBefore.has(k))
    .map((k) => cache.entries.get(k))
    .filter((e) => !!e);
  passes.set(key, {
    questions,
    records,
    stats: {
      calls: used.length,
      newCalls: cache.stats.misses - missesBefore,
      inputTokens: used.reduce(
        (sum, e) =>
          sum + ((e.response as { usage?: { input_tokens?: number } }).usage?.input_tokens ?? 0),
        0,
      ),
      latencies: used.map((e) => e.latencyMs),
    },
  });
}

const id = `${runId()}_${split}_${final ? 'final' : suites.join('+')}`;
const runDir = join(final ? PATHS.results : PATHS.devResults, id);
mkdirSync(runDir, { recursive: true });
const casesManifest = JSON.parse(
  readFileSync(join(PATHS.cases, 'manifest.json'), 'utf8'),
) as unknown;

const results: VariantResult[] = [];
for (const variantId of variantIds) {
  const variant = JEV_VARIANTS[variantId];
  const pass = passes.get(JSON.stringify(hashes(variant.questions)))!;
  const thresholds = thresholdsOf(variantId);
  const costUsd = +((pass.stats.inputTokens / 1e6) * PRICE_PER_M_INPUT).toFixed(4);
  const manifest = {
    runId: id,
    variant: variantId,
    description: variant.description,
    split,
    final,
    suites,
    cases: cases.length,
    git: gitState(),
    jev: {
      model: jevConfig.model,
      ...hashes(variant.questions),
      calls: pass.stats.calls,
      newCalls: pass.stats.newCalls,
      inputTokens: pass.stats.inputTokens,
      costUsd,
      latencyMsPerCall: {
        p50: percentile(pass.stats.latencies, 50),
        p95: percentile(pass.stats.latencies, 95),
      },
    },
    thresholds,
    casesManifest,
  };
  const summary = summarize(pass.records, thresholds);
  const markdown = toMarkdown(summary, { ...manifest, casesManifest: undefined });
  const dir = join(runDir, variantId);
  mkdirSync(dir, { recursive: true });
  writeJson(join(dir, 'manifest.json'), manifest);
  writeJson(join(dir, 'records.json'), pass.records);
  writeJson(join(dir, 'summary.json'), summary);
  writeFileSync(join(dir, 'report.md'), markdown);
  if (snapshotName) {
    saveSnapshot(
      snapshotOf(variantId),
      { manifest, summary, records: pass.records, markdown },
      { force: args.has('force') },
    );
  }
  results.push({
    id: variantId,
    description: variant.description,
    thresholds,
    records: pass.records,
    summary,
    jev: {
      newCalls: pass.stats.newCalls,
      costUsd,
      p95: percentile(pass.stats.latencies, 95),
    },
  });
}

if (final) {
  // Ship exactly the answers this run used, so anyone can recompute it without a Jev key.
  const used = [...cache.stats.used].map((k) => cache.entries.get(k)).filter((e) => !!e);
  writeFileSync(
    join(runDir, 'jev-cache.jsonl'),
    used.map((e) => JSON.stringify(e)).join('\n') + '\n',
  );
  copyFileSync(join(PATHS.cases, 'manifest.json'), join(runDir, 'cases-manifest.json'));
}

const comparison = compareVariants(results);
writeFileSync(join(runDir, 'variants.md'), comparison);
console.log(`\n${comparison}`);
console.log(`Full report per variant: ${runDir}/<variant>/report.md`);
if (snapshotName) {
  console.log(`Snapshots: ${variantIds.map(snapshotOf).join(', ')}`);
  console.log(
    `Next: npm run eval:compare -- ${snapshotOf('baseline')} ${snapshotOf(variantIds.at(-1)!)} · npm run eval:ablation -- ${snapshotOf(variantIds[0]!)}`,
  );
}
console.log(`→ ${join(runDir, 'variants.md')}`);
