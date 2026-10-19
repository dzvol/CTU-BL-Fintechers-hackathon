// npm run eval:compare -- <before> <after>
// Compares two snapshots (names from eval/snapshots) or run directories: headline metrics with
// deltas, what changed in the setup, and which cases flipped. Needs no Jev.
import type { Rate } from '../metrics';
import { caseOk, loadSnapshot, type Snapshot } from '../snapshots';
import { fail, parseArgs } from './args';

const args = parseArgs();
const [beforeName, afterName] = args.positional;
if (!beforeName || !afterName) fail('Usage: npm run eval:compare -- <before> <after>');
const before = loadSnapshot(beforeName);
const after = loadSnapshot(afterName);

/** Higher is better for these; for the rest lower is better. */
type Metric = {
  name: string;
  get: (s: Snapshot) => Rate | number | undefined;
  higherIsBetter: boolean;
};
const METRICS: Metric[] = [
  {
    name: 'Screen: attacks flagged',
    get: (s) => s.summary.screen?.attacks.flagged,
    higherIsBetter: true,
  },
  {
    name: 'Screen: attacks blocked',
    get: (s) => s.summary.screen?.attacks.blocked,
    higherIsBetter: true,
  },
  {
    name: 'Screen: benign flagged',
    get: (s) => s.summary.screen?.benign.flagged,
    higherIsBetter: false,
  },
  {
    name: 'Screen: benign blocked',
    get: (s) => s.summary.screen?.benign.blocked,
    higherIsBetter: false,
  },
  { name: 'Screen: AUROC', get: (s) => s.summary.screen?.auroc, higherIsBetter: true },
  {
    name: 'Screen: TPR at FPR ≤ 1 %',
    get: (s) => s.summary.screen?.tprAt1PctFpr.tpr,
    higherIsBetter: true,
  },
  {
    name: 'Judge: accuracy',
    get: (s) => s.summary.judge?.screenExtraction.accuracy,
    higherIsBetter: true,
  },
  {
    name: 'Judge: accuracy (oracle)',
    get: (s) => s.summary.judge?.oracleExtraction.accuracy,
    higherIsBetter: true,
  },
  {
    name: 'Judge: off-intent passed',
    get: (s) => s.summary.judge?.screenExtraction.offIntentPassed,
    higherIsBetter: false,
  },
  { name: 'E2E: correct', get: (s) => s.summary.e2e?.configs.full?.correct, higherIsBetter: true },
  {
    name: 'E2E: unsafe ALLOW',
    get: (s) => s.summary.e2e?.configs.full?.unsafeAllow,
    higherIsBetter: false,
  },
  {
    name: 'E2E: false BLOCK',
    get: (s) => s.summary.e2e?.configs.full?.falseBlock,
    higherIsBetter: false,
  },
  {
    name: 'E2E: needless REVIEW',
    get: (s) => s.summary.e2e?.configs.full?.needlessReview,
    higherIsBetter: false,
  },
];

const value = (v: Rate | number | undefined) =>
  v === undefined ? undefined : typeof v === 'number' ? v : v.rate;
const show = (v: Rate | number | undefined) =>
  v === undefined
    ? '—'
    : typeof v === 'number'
      ? v.toFixed(3)
      : `${(v.rate * 100).toFixed(1)} % (${v.k}/${v.n})`;

const rows = METRICS.flatMap(({ name, get, higherIsBetter }) => {
  const a = get(before);
  const b = get(after);
  if (a === undefined && b === undefined) return [];
  const da = value(a);
  const db = value(b);
  const delta =
    da === undefined || db === undefined || Number.isNaN(da) || Number.isNaN(db)
      ? undefined
      : db - da;
  const pp =
    typeof b === 'number'
      ? delta?.toFixed(3)
      : delta === undefined
        ? undefined
        : `${(delta * 100).toFixed(1)} pp`;
  const verdict =
    delta === undefined || Math.abs(delta) < 1e-9
      ? '='
      : delta > 0 === higherIsBetter
        ? 'better'
        : 'worse';
  return [{ metric: name, before: show(a), after: show(b), delta: pp ?? '—', '': verdict }];
});

// What differs in the setup: a change in questions or thresholds explains changes in numbers.
const setup = (s: Snapshot) => {
  const jev = (s.manifest.jev ?? {}) as Record<string, unknown>;
  const git = (s.manifest.git ?? {}) as Record<string, unknown>;
  return {
    commit: `${String(git.commit).slice(0, 10)}${git.dirty ? ' (dirty)' : ''}`,
    model: jev.model,
    screenQuestions: jev.screenQuestions,
    judgeQuestions: jev.judgeQuestions,
    thresholds: JSON.stringify(s.manifest.thresholds),
    cases: s.records.length,
  };
};
const [sa, sb] = [setup(before), setup(after)];
console.log(`\nbefore: ${before.dir}\nafter:  ${after.dir}\n`);
console.table(
  Object.keys(sa).map((k) => ({
    setup: k,
    before: String(sa[k as keyof typeof sa]),
    after: String(sb[k as keyof typeof sb]),
    changed: sa[k as keyof typeof sa] === sb[k as keyof typeof sb] ? '' : '≠',
  })),
);
console.table(rows);

// Case flips, on the cases both runs share.
const afterById = new Map(after.records.map((r) => [r.id, r]));
const common = before.records.filter((r) => afterById.has(r.id));
const flips = { fixed: [] as string[], broke: [] as string[] };
for (const r of common) {
  const a = caseOk(r, before.manifest.thresholds);
  const b = caseOk(afterById.get(r.id)!, after.manifest.thresholds);
  if (a === false && b === true) flips.fixed.push(r.id);
  if (a === true && b === false) flips.broke.push(r.id);
}
const onlyBefore = before.records.length - common.length;
const onlyAfter = after.records.length - common.length;
console.log(
  `Common cases: ${common.length}${onlyBefore || onlyAfter ? ` (only before: ${onlyBefore}, only after: ${onlyAfter}; metrics above use each run's own cases)` : ''}`,
);
console.log(`Fixed: ${flips.fixed.length} · Broke: ${flips.broke.length}`);
const limit = Number(args.get('show') ?? 15);
for (const [kind, ids] of Object.entries(flips)) {
  if (ids.length)
    console.log(
      `\n${kind}:\n  ${ids.slice(0, limit).join('\n  ')}${ids.length > limit ? `\n  … (+${ids.length - limit}, --show N)` : ''}`,
    );
}
