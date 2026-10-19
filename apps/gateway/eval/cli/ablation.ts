// npm run eval:ablation -- [snapshot name or run dir] [--thresholds f] [--show N]
// Policy alone vs. Policy with Jev, side by side, on the answers a run already recorded (no Jev
// calls, free). Configurations switch layers on one at a time:
//   policy         deterministic limits only (what a plain spending cap would do)
//   policy+screen  + Screen's rules on merchant text, Judge switched off
//   policy+judge   + Judge on the mandate, Screen's rules switched off
//   full           production: Policy → Screen → Judge → decision table
// Writes ablation.md next to the run.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Verdict } from '@semanticauth/contracts';
import { decide, DEFAULT_THRESHOLDS, type Thresholds } from '../../src/domain/decision/decide';
import type { EvalCaseOf } from '../cases';
import { mcnemar, pct, wilson } from '../metrics';
import { PATHS } from '../paths';
import { NEUTRAL_JUDGE, quietScreen } from '../predict';
import { isDraft, judgeE2e } from '../report';
import type { CaseRecord } from '../runner';
import { loadSnapshot } from '../snapshots';
import { fail, parseArgs } from './args';

const args = parseArgs();
const latest = () => {
  const names = readdirSync(PATHS.snapshots).filter((n) =>
    statSync(join(PATHS.snapshots, n)).isDirectory(),
  );
  const newest = names.sort(
    (a, b) =>
      statSync(join(PATHS.snapshots, b)).mtimeMs - statSync(join(PATHS.snapshots, a)).mtimeMs,
  )[0];
  return newest ?? fail('No snapshot yet: npm run eval -- --all --split dev --name <name>');
};
const run = loadSnapshot(args.positional[0] ?? latest());
const t: Thresholds = args.get('thresholds')
  ? (JSON.parse(readFileSync(args.get('thresholds')!, 'utf8')) as Thresholds)
  : (run.manifest.thresholds ?? DEFAULT_THRESHOLDS);
const show = Number(args.get('show') ?? 10);

const CONFIGS = ['policy', 'policy+screen', 'policy+judge', 'full'] as const;
type Config = (typeof CONFIGS)[number];

function decision(r: CaseRecord, config: Config) {
  const policy = r.policy ?? { ok: true as const };
  if (!policy.ok) return { verdict: 'BLOCK' as Verdict, reason: policy.reason };
  if (config === 'policy') return { verdict: 'ALLOW' as Verdict, reason: 'policy only' };
  if (r.error || !r.screen || !r.judge) return { verdict: 'BLOCK' as Verdict, reason: 'jev_error' };
  const screen = config === 'policy+judge' ? quietScreen(r.screen) : r.screen;
  const judge = config === 'policy+screen' ? NEUTRAL_JUDGE : r.judge;
  const d = decide({ policy, amount: BigInt(r.amount ?? '0'), screen, judge }, t);
  return { verdict: d.verdict, reason: d.reason };
}

const expected = (r: CaseRecord) => r.expected as EvalCaseOf<'e2e'>['expected'];
const cases = run.records.filter((r) => r.suite === 'e2e' && !expected(r).ambiguous);
if (cases.length === 0) fail(`${run.dir} has no e2e records; run with --suite e2e or --all.`);
const harmful = cases.filter((r) => expected(r).verdict !== 'ALLOW');
const honest = cases.filter((r) => expected(r).verdict === 'ALLOW');

const outcomes = Object.fromEntries(
  CONFIGS.map((config) => [
    config,
    cases.map((r) => {
      const d = decision(r, config);
      return { r, ...d, ...judgeE2e(r, d.verdict) };
    }),
  ]),
) as Record<
  Config,
  (ReturnType<typeof decision> & ReturnType<typeof judgeE2e> & { r: CaseRecord })[]
>;
const count = <T>(xs: T[], f: (x: T) => boolean) => xs.filter(f).length;

const out: string[] = [];
const line = (text = '') => out.push(text);
const row = (cells: unknown[]) => line(`| ${cells.join(' | ')} |`);

line('# Policy alone vs. Policy with Jev');
line();
line(
  `Run: \`${run.dir}\` · ${cases.length} e2e cases (${harmful.length} harmful, ${honest.length} honest)`,
);
const drafts = count(cases, isDraft);
if (drafts) line(`> ${drafts} of ${cases.length} cases are unreviewed agent drafts.`);
line();
row([
  'configuration',
  'correct',
  'harmful paid (unsafe ALLOW)',
  'honest blocked',
  'honest sent to REVIEW',
]);
row(['---', '---', '---', '---', '---']);
for (const config of CONFIGS) {
  const o = outcomes[config];
  row([
    `**${config}**`,
    pct(
      wilson(
        count(o, (x) => x.ok),
        cases.length,
      ),
    ),
    pct(
      wilson(
        count(o, (x) => x.unsafeAllow),
        harmful.length,
      ),
    ),
    pct(
      wilson(
        count(o, (x) => x.falseBlock),
        honest.length,
      ),
    ),
    pct(
      wilson(
        count(o, (x) => x.needlessReview),
        honest.length,
      ),
    ),
  ]);
}
const significance = mcnemar(
  outcomes.policy.map((x) => x.ok),
  outcomes.full.map((x) => x.ok),
);
line();
line(
  `Policy → full: ${significance.c} cases fixed, ${significance.b} broken, McNemar p = ${significance.p.toFixed(4)}`,
);

line();
line('## Correct outcomes by category');
line();
const categories = [...new Set(cases.map((r) => String(r.labels.category ?? 'n/a')))].sort();
row(['category', 'cases', ...CONFIGS]);
row(['---', '---', ...CONFIGS.map(() => '---')]);
for (const category of categories) {
  const inCategory = (x: { r: CaseRecord }) => String(x.r.labels.category ?? 'n/a') === category;
  const n = count(outcomes.full, inCategory);
  row([
    category,
    n,
    ...CONFIGS.map((config) => `${count(outcomes[config], (x) => inCategory(x) && x.ok)}/${n}`),
  ]);
}

line();
line('## What Jev changes compared with Policy alone');
const changed = cases
  .map((r, i) => ({ r, before: outcomes.policy[i]!, after: outcomes.full[i]! }))
  .filter(({ before, after }) => before.ok !== after.ok);
for (const [title, list] of [
  ['Saved by Jev (Policy alone was wrong)', changed.filter((c) => c.after.ok)],
  ['Broken by Jev (Policy alone was right)', changed.filter((c) => !c.after.ok)],
] as const) {
  line();
  line(`**${title}: ${list.length}**`);
  for (const { r, before, after } of list.slice(0, show)) {
    line(
      `- \`${r.id}\` expected ${expected(r).verdict}: ${before.verdict} → ${after.verdict} (${after.reason})`,
    );
  }
  if (list.length > show) line(`- … ${list.length - show} more (--show N)`);
}

const stillPaid = outcomes.full.filter((x) => x.unsafeAllow);
line();
line(`**Harmful and still paid with Jev: ${stillPaid.length}**`);
for (const x of stillPaid.slice(0, show)) line(`- \`${x.r.id}\` (${x.r.labels.category})`);

// The price of the checks on real, honest offers: Policy never objects, Screen sometimes does.
const real = run.records.filter(
  (r) => r.suite === 'screen-benign' && r.labels.source === 'bazaar' && r.screen,
);
if (real.length) {
  const verdicts = real.map(
    (r) =>
      decide({ policy: { ok: true }, amount: 10_000n, screen: r.screen, judge: NEUTRAL_JUDGE }, t)
        .verdict,
  );
  line();
  line('## Real Bazaar offers (honest listings)');
  line();
  line(
    `Policy alone: REVIEW 0 of ${real.length}. With Screen's rules: REVIEW ${pct(
      wilson(
        count(verdicts, (v) => v === 'REVIEW'),
        real.length,
      ),
    )}, BLOCK ${pct(
      wilson(
        count(verdicts, (v) => v === 'BLOCK'),
        real.length,
      ),
    )}.`,
  );
}

const markdown = out.join('\n') + '\n';
console.log(markdown);
const file = join(run.dir, 'ablation.md');
writeFileSync(file, markdown);
console.log(`→ ${file}`);
