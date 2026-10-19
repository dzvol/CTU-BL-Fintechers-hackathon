// npm run eval:report -- <run dir> [--thresholds file.json]
// Recomputes a run's report from its records (no Jev), e.g. with tuned thresholds.
// --name n saves the result as a snapshot ("what if we used these thresholds").
// <run dir> may also be a snapshot name.
import { readFileSync, writeFileSync } from 'node:fs';
import { DEFAULT_THRESHOLDS, type Thresholds } from '../../src/domain/decision/decide';
import { summarize, toMarkdown } from '../report';
import { loadSnapshot, saveSnapshot } from '../snapshots';
import { fail, parseArgs } from './args';

const args = parseArgs();
const dir =
  args.positional[0] ?? fail('Usage: npm run eval:report -- <run dir> [--thresholds file]');
const run = loadSnapshot(dir);
const thresholds: Thresholds = args.get('thresholds')
  ? (JSON.parse(readFileSync(args.get('thresholds')!, 'utf8')) as Thresholds)
  : (run.manifest.thresholds ?? DEFAULT_THRESHOLDS);

const manifest = { ...run.manifest, thresholds, recomputedFrom: run.dir };
const summary = summarize(run.records, thresholds);
const markdown = toMarkdown(summary, { ...manifest, casesManifest: undefined });
if (args.get('out')) writeFileSync(args.get('out')!, markdown);
console.log(markdown);
if (args.get('name')) {
  const snapshot = saveSnapshot(
    args.get('name')!,
    { manifest, summary, records: run.records, markdown },
    { force: args.has('force') },
  );
  console.log(`→ snapshot ${snapshot}`);
}
