// npm run eval:variants -- <name>
// Rebuilds the variant comparison from the snapshots <name>.<variant> that `npm run eval --name`
// saved: no Jev calls, free. Writes eval/snapshots/<name>.variants.md.
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_THRESHOLDS } from '../../src/domain/decision/decide';
import { JEV_VARIANT_IDS } from '../../src/domain/jev/variants';
import { PATHS } from '../paths';
import { loadSnapshot } from '../snapshots';
import { compareVariants, type VariantResult } from '../variants';
import { fail, parseArgs } from './args';

const args = parseArgs();
const name = args.positional[0] ?? fail('Usage: npm run eval:variants -- <snapshot name>');
const results: VariantResult[] = JEV_VARIANT_IDS.filter((id) =>
  existsSync(join(PATHS.snapshots, `${name}.${id}`)),
).map((id) => {
  const run = loadSnapshot(`${name}.${id}`);
  const jev = (run.manifest.jev ?? {}) as {
    newCalls?: number;
    costUsd?: number;
    latencyMsPerCall?: { p95?: number };
  };
  return {
    id,
    description: String(run.manifest.description ?? ''),
    thresholds: run.manifest.thresholds ?? DEFAULT_THRESHOLDS,
    records: run.records,
    summary: run.summary,
    jev: {
      newCalls: jev.newCalls ?? 0,
      costUsd: jev.costUsd ?? 0,
      p95: jev.latencyMsPerCall?.p95 ?? 0,
    },
  };
});
if (results.length === 0) fail(`No snapshots ${name}.<variant> in ${PATHS.snapshots}`);

const markdown = compareVariants(results);
const file = join(PATHS.snapshots, `${name}.variants.md`);
writeFileSync(file, markdown);
console.log(markdown);
console.log(`→ ${file}`);
