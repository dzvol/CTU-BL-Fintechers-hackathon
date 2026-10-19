// npm run eval:tune -- <dev run dir or snapshot>
// Grid-searches the decision thresholds on recorded dev answers, around the settings the run was
// made with (a variant's rules stay), and shows what each Screen question contributes. Refuses
// test records: tuning on the test split would void its results.
import { join } from 'node:path';
import { DEFAULT_THRESHOLDS } from '../../src/domain/decision/decide';
import { writeJson } from '../jsonl';
import { loadSnapshot } from '../snapshots';
import { ablateQuestions, COSTS, tally, tune } from '../tune';
import { fail, parseArgs } from './args';

const args = parseArgs();
const run = loadSnapshot(
  args.positional[0] ?? fail('Usage: npm run eval:tune -- <dev run dir or snapshot>'),
);
const { dir, records } = run;
const base = run.manifest.thresholds ?? DEFAULT_THRESHOLDS;
if (records.some((r) => r.split === 'test'))
  fail('These records include the test split; tune on dev only.');

const ranked = tune(records, base);
const current = tally(records, base);
console.log(`Costs per mistake: ${JSON.stringify(COSTS)}\n`);
console.table([
  { config: 'current', ...current },
  ...ranked.slice(0, 5).map((r, i) => ({ config: `#${i + 1}`, ...r.tally })),
]);
console.log('\nBest thresholds:', JSON.stringify(ranked[0]!.best, null, 2));
console.log('\nScreen questions (forced to "no" one at a time, current thresholds):');
const questions = ablateQuestions(records, base);
console.table(questions);

writeJson(join(dir, 'tune.json'), { costs: COSTS, current, top: ranked.slice(0, 20), questions });
writeJson(join(dir, 'best-thresholds.json'), ranked[0]!.best);
console.log(
  `\n→ ${join(dir, 'best-thresholds.json')} (check with: npm run eval:report -- ${dir} --thresholds ${join(dir, 'best-thresholds.json')})`,
);
