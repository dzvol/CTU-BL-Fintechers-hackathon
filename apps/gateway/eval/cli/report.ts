// npm run eval:report -- <run dir> [--thresholds file.json]
// Recomputes a run's report from its records (no Jev), e.g. with tuned thresholds.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_THRESHOLDS, type Thresholds } from '../../src/domain/decision/decide';
import { summarize, toMarkdown } from '../report';
import type { CaseRecord } from '../runner';
import { fail, parseArgs } from './args';

const args = parseArgs();
const dir =
  args.positional[0] ?? fail('Usage: npm run eval:report -- <run dir> [--thresholds file]');
const records = JSON.parse(readFileSync(join(dir, 'records.json'), 'utf8')) as CaseRecord[];
const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as Record<
  string,
  unknown
>;
const thresholds: Thresholds = args.get('thresholds')
  ? (JSON.parse(readFileSync(args.get('thresholds')!, 'utf8')) as Thresholds)
  : DEFAULT_THRESHOLDS;

const markdown = toMarkdown(summarize(records, thresholds), {
  ...manifest,
  thresholds,
  recomputed: true,
});
if (args.get('out')) writeFileSync(args.get('out')!, markdown);
console.log(markdown);
