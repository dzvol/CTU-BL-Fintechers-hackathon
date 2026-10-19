// npm run eval -- --suite screen-benign,screen-injection --split dev
// npm run eval -- --all --split test --final     (once, at the end; ships its Jev cache)
//   --offline        answer only from the cache (no Jev key needed, no spend)
//   --limit N        first N cases per suite (smoke runs)
//   --concurrency N  parallel cases (default 8)
//   --thresholds f   JSON Thresholds to report with (default: the production ones)
//   --name n         also save the run as snapshot eval/snapshots/<n> (compare: npm run eval:compare)
//   --force          replace an existing snapshot of that name
//   --cache f        Jev cache file (default eval/data/cache/jev.jsonl); pass a final run's
//                    jev-cache.jsonl with --offline to reproduce it without a Jev key
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHttpJevClient } from '../../src/adapters/jev/jev-client';
import { loadConfig } from '../../src/config';
import { DEFAULT_THRESHOLDS, type Thresholds } from '../../src/domain/decision/decide';
import { JUDGE_QUESTIONS } from '../../src/domain/jev/judge-questions';
import { SCREEN_QUESTIONS } from '../../src/domain/jev/screen-questions';
import { EvalCaseSchema, SplitSchema, SuiteSchema, type EvalCase } from '../cases';
import { createCachedFetch, questionsHash } from '../jev-cache';
import { readJsonl, writeJson } from '../jsonl';
import { percentile } from '../metrics';
import { PATHS } from '../paths';
import { summarize, toMarkdown } from '../report';
import { saveSnapshot } from '../snapshots';
import { runCases } from '../runner';
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
const thresholds: Thresholds = args.get('thresholds')
  ? (JSON.parse(readFileSync(args.get('thresholds')!, 'utf8')) as Thresholds)
  : DEFAULT_THRESHOLDS;

// Check the snapshot name before spending time and Jev calls on the run.
const snapshotName = args.get('name');
if (snapshotName && existsSync(join(PATHS.snapshots, snapshotName)) && !args.has('force')) {
  fail(`Snapshot "${snapshotName}" exists; pick another --name or pass --force to replace it.`);
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
const jev = createHttpJevClient(jevConfig, cache.fetch);

const limit = args.get('limit') ? Number(args.get('limit')) : Infinity;
const cases: EvalCase[] = suites.flatMap((suite) =>
  readJsonl(join(PATHS.cases, `${suite}.jsonl`), EvalCaseSchema)
    .filter((c) => c.split === split)
    .slice(0, limit),
);
if (cases.length === 0) fail('No cases: run npm run eval:build (and check the split).');

console.log(`${cases.length} ${split} cases · ${suites.join(', ')} · Jev ${jevConfig.model}`);
const records = await runCases(cases, jev, {
  concurrency: Number(args.get('concurrency') ?? 8),
  onProgress: (done) => {
    if (done % 25 === 0 || done === cases.length) process.stdout.write(`\r${done}/${cases.length}`);
  },
});
console.log();

const usedEntries = [...cache.stats.used].map((key) => cache.entries.get(key)).filter((e) => !!e);
const inputTokens = usedEntries.reduce(
  (sum, e) =>
    sum + ((e.response as { usage?: { input_tokens?: number } }).usage?.input_tokens ?? 0),
  0,
);
const latencies = usedEntries.map((e) => e.latencyMs);
const id = `${runId()}_${split}_${final ? 'final' : suites.join('+')}`;
const manifest = {
  runId: id,
  split,
  final,
  suites,
  cases: cases.length,
  git: gitState(),
  jev: {
    model: jevConfig.model,
    screenQuestions: questionsHash(SCREEN_QUESTIONS),
    judgeQuestions: questionsHash(JUDGE_QUESTIONS),
    calls: usedEntries.length,
    newCalls: cache.stats.misses,
    inputTokens,
    costUsd: +((inputTokens / 1e6) * PRICE_PER_M_INPUT).toFixed(4),
    latencyMsPerCall: { p50: percentile(latencies, 50), p95: percentile(latencies, 95) },
  },
  thresholds,
  casesManifest: JSON.parse(readFileSync(join(PATHS.cases, 'manifest.json'), 'utf8')) as unknown,
};

const summary = summarize(records, thresholds);
const markdown = toMarkdown(summary, { ...manifest, casesManifest: undefined });
const dir = join(final ? PATHS.results : PATHS.devResults, id);
mkdirSync(dir, { recursive: true });
writeJson(join(dir, 'manifest.json'), manifest);
writeJson(join(dir, 'records.json'), records);
writeJson(join(dir, 'summary.json'), summary);
writeFileSync(join(dir, 'report.md'), markdown);
if (final) {
  // Ship exactly the answers this run used, so anyone can recompute it without a Jev key.
  writeFileSync(
    join(dir, 'jev-cache.jsonl'),
    usedEntries.map((e) => JSON.stringify(e)).join('\n') + '\n',
  );
  copyFileSync(join(PATHS.cases, 'manifest.json'), join(dir, 'cases-manifest.json'));
}
console.log(markdown);
console.log(`\n→ ${dir}`);
if (args.get('name')) {
  const snapshot = saveSnapshot(
    args.get('name')!,
    { manifest, summary, records, markdown },
    { force: args.has('force') },
  );
  console.log(`→ snapshot ${snapshot}`);
}
