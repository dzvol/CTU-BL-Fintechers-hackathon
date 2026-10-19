// Named local snapshots of dev runs ("baseline", "questions-v2", …) to compare against later.
// A snapshot holds the manifest (git commit, model, question hashes, thresholds), the summary and
// the records with every Jev answer, so it can be re-reported and compared without Jev.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Thresholds } from '../src/domain/decision/decide';
import { writeJson } from './jsonl';
import { PATHS } from './paths';
import { predictScreen, predictVerdict } from './predict';
import { judgeE2e, type Summary } from './report';
import type { CaseRecord } from './runner';
import type { EvalCaseOf } from './cases';

export interface Snapshot {
  dir: string;
  manifest: Record<string, unknown> & { thresholds: Thresholds; split?: string };
  summary: Summary;
  records: CaseRecord[];
}

const NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/;

export function saveSnapshot(
  name: string,
  data: {
    manifest: Record<string, unknown>;
    summary: Summary;
    records: CaseRecord[];
    markdown: string;
  },
  options: { force?: boolean } = {},
): string {
  if (!NAME.test(name))
    throw new Error(`Snapshot name must match ${NAME} (e.g. baseline, questions-v2)`);
  const dir = join(PATHS.snapshots, name);
  if (existsSync(dir) && !options.force)
    throw new Error(`Snapshot "${name}" exists; pass --force to replace it.`);
  if (data.records.some((r) => r.split === 'test')) {
    throw new Error('Snapshots are for dev runs; final test runs live in results/.');
  }
  writeJson(join(dir, 'manifest.json'), {
    ...data.manifest,
    snapshot: name,
    savedAt: new Date().toISOString(),
  });
  writeJson(join(dir, 'summary.json'), data.summary);
  writeJson(join(dir, 'records.json'), data.records);
  writeFileSync(join(dir, 'report.md'), data.markdown);
  return dir;
}

/** A snapshot name, or the path of any run directory. */
export function loadSnapshot(nameOrDir: string): Snapshot {
  const dir = existsSync(join(PATHS.snapshots, nameOrDir))
    ? join(PATHS.snapshots, nameOrDir)
    : nameOrDir;
  const read = (file: string) => JSON.parse(readFileSync(join(dir, file), 'utf8')) as unknown;
  if (!existsSync(join(dir, 'records.json'))) throw new Error(`No snapshot or run at ${nameOrDir}`);
  return {
    dir,
    manifest: read('manifest.json') as Snapshot['manifest'],
    summary: read('summary.json') as Summary,
    records: read('records.json') as CaseRecord[],
  };
}

/** Whether a case came out right under the given thresholds (screen and e2e cases only). */
export function caseOk(r: CaseRecord, t: Thresholds): boolean | undefined {
  if ((r.suite === 'screen-benign' || r.suite === 'screen-injection') && r.screen) {
    const e = r.expected as EvalCaseOf<'screen-injection'>['expected'];
    const p = predictScreen(r.screen, t);
    if (e.injection) return p.injection !== 'none';
    if (e.recipientChange) return p.recipientChange || p.injection !== 'none';
    return p.injection === 'none' && !p.recipientChange;
  }
  if (r.suite === 'e2e' && !(r.expected as EvalCaseOf<'e2e'>['expected']).ambiguous) {
    return judgeE2e(r, predictVerdict(r, t, 'full')).ok;
  }
  return undefined;
}
