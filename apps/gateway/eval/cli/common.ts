// npm run eval:common -- <a> <b>
// Keeps only the cases both snapshots answered (no error in either) and saves them as
// <a>.common and <b>.common, so `eval:compare -- <a>.common <b>.common` compares two models on
// exactly the same cases. Needed when one run lost cases, e.g. to a Bedrock daily token quota.
import type { Thresholds } from '../../src/domain/decision/decide';
import { summarize, toMarkdown } from '../report';
import { loadSnapshot, saveSnapshot } from '../snapshots';
import { fail, parseArgs } from './args';

const args = parseArgs();
const names = args.positional;
if (names.length !== 2) fail('Usage: npm run eval:common -- <a> <b>');
const snapshots = names.map((name) => loadSnapshot(name));
const answered = (s: (typeof snapshots)[number]) =>
  new Set(s.records.filter((r) => !r.error).map((r) => r.id));
const [a, b] = snapshots.map(answered) as [Set<string>, Set<string>];
const common = new Set([...a].filter((id) => b.has(id)));

snapshots.forEach((snapshot, i) => {
  const records = snapshot.records.filter((r) => common.has(r.id));
  const thresholds = snapshot.manifest.thresholds as Thresholds;
  const summary = summarize(records, thresholds);
  const manifest = { ...snapshot.manifest, cases: records.length, commonWith: names[1 - i] };
  const markdown = toMarkdown(summary, { ...manifest, casesManifest: undefined });
  saveSnapshot(`${names[i]}.common`, { manifest, summary, records, markdown }, { force: true });
});
console.log(
  `${common.size} cases answered by both → ${names.map((n) => `${n}.common`).join(', ')}`,
);
console.log(`Next: npm run eval:compare -- ${names[0]}.common ${names[1]}.common`);
