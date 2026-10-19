// npm run eval:stability -- --suite screen-injection,e2e --n 40 --repeat 5
// Asks Jev the same dev cases several times, bypassing the cache, and reports how much the answers
// and, more importantly, the decisions move. Every other eval number assumes one answer per case;
// this measures how far that assumption holds. Costs n × repeat × (1–3) Jev calls.
import { join } from 'node:path';
import { createHttpJevClient } from '../../src/adapters/jev/jev-client';
import { loadConfig } from '../../src/config';
import { DEFAULT_THRESHOLDS } from '../../src/domain/decision/decide';
import { EvalCaseSchema, SuiteSchema, type EvalCase } from '../cases';
import { readJsonl, writeJson } from '../jsonl';
import { PATHS } from '../paths';
import { predictRelation, predictScreen, predictVerdict } from '../predict';
import { seededRandom } from '../random';
import { runCases, type CaseRecord } from '../runner';
import { fail, parseArgs, runId } from './args';

const args = parseArgs();
const suites = (args.get('suite') ?? 'screen-injection,screen-benign,e2e')
  .split(',')
  .map((s) => SuiteSchema.parse(s.trim()));
const n = Number(args.get('n') ?? 40);
const repeat = Number(args.get('repeat') ?? 5);
if (repeat < 2) fail('--repeat must be at least 2.');

const config = loadConfig();
if (!config.jev) fail('JEV_API_KEY is not set.');
// Plain fetch on purpose: the cache would hand back the first answer every time.
const jev = createHttpJevClient(config.jev);
const t = DEFAULT_THRESHOLDS;

const cases: EvalCase[] = suites.flatMap((suite) =>
  seededRandom(`stability:${suite}`).sample(
    readJsonl(join(PATHS.cases, `${suite}.jsonl`), EvalCaseSchema).filter((c) => c.split === 'dev'),
    n,
  ),
);
console.log(`${cases.length} dev cases × ${repeat} runs · Jev ${config.jev.model}, no cache`);

const runs: CaseRecord[][] = [];
for (let i = 0; i < repeat; i++) {
  runs.push(await runCases(cases, jev, { concurrency: 8 }));
  process.stdout.write(`\rrun ${i + 1}/${repeat}`);
}
console.log();

/** The decision the gateway would take from one record (what matters to users). */
function decision(r: CaseRecord): string {
  if (r.error) return 'error';
  if (r.suite === 'e2e') return predictVerdict(r, t, 'full');
  if (r.suite === 'judge-pairs') return predictRelation(r.judge!, BigInt(r.amount ?? '0'), t);
  const p = predictScreen(r.screen!, t);
  return `${p.injection}${p.recipientChange ? '+recipient' : ''}`;
}

type Answer = number | { choice: string };
const answersOf = (r: CaseRecord): Record<string, Answer> => ({
  ...Object.fromEntries(Object.entries(r.screen ?? {}).map(([q, a]) => [`screen.${q}`, a])),
  ...Object.fromEntries(Object.entries(r.judge ?? {}).map(([q, a]) => [`judge.${q}`, a])),
});

// Per question: spread of yes/no probabilities, how often a choice answer changes.
const perQuestion: Record<
  string,
  { kind: 'probability' | 'choice'; cases: number; meanSpread: number; choiceFlips: number }
> = {};
for (let c = 0; c < cases.length; c++) {
  const series = runs.map((run) => answersOf(run[c]!));
  for (const q of Object.keys(series[0] ?? {})) {
    const values = series.map((s) => s[q]).filter((v) => v !== undefined);
    const kind = typeof values[0] === 'number' ? 'probability' : 'choice';
    const entry = (perQuestion[q] ??= { kind, cases: 0, meanSpread: 0, choiceFlips: 0 });
    entry.cases++;
    if (kind === 'probability') {
      const nums = values as number[];
      entry.meanSpread += Math.max(...nums) - Math.min(...nums);
    } else {
      const choices = new Set(values.map((v) => (v as { choice: string }).choice));
      if (choices.size > 1) entry.choiceFlips++;
    }
  }
}
for (const e of Object.values(perQuestion)) e.meanSpread /= e.cases;

const flips = cases.map((c, i) => {
  const decisions = runs.map((run) => decision(run[i]!));
  return { id: c.id, suite: c.suite, decisions, flipped: new Set(decisions).size > 1 };
});
const bySuite = Object.fromEntries(
  suites.map((suite) => {
    const rows = flips.filter((f) => f.suite === suite);
    const flipped = rows.filter((f) => f.flipped).length;
    return [suite, { cases: rows.length, decisionFlipped: flipped, rate: flipped / rows.length }];
  }),
);

console.log('\nDecision stability (a flip = not every run gave the same decision):');
console.table(bySuite);
console.log('Per question (spread = max − min probability across runs, averaged over cases):');
console.table(
  Object.fromEntries(
    Object.entries(perQuestion).map(([q, e]) => [
      q,
      e.kind === 'choice'
        ? { 'choice changed': `${e.choiceFlips}/${e.cases} cases` }
        : { 'mean spread': e.meanSpread.toFixed(3) },
    ]),
  ),
);
const unstable = flips.filter((f) => f.flipped);
if (unstable.length) {
  console.log('Cases whose decision moved:');
  for (const f of unstable.slice(0, 20)) console.log(`  ${f.id}: ${f.decisions.join(' / ')}`);
}
const file = join(PATHS.devResults, `stability-${runId()}.json`);
writeJson(file, { model: config.jev.model, repeat, bySuite, perQuestion, flips });
console.log(`\n→ ${file}`);
