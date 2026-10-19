// npm run eval:validate — every built case and fixture parses, ids are unique and no group is
// split between dev and test. Role B's work is done when this passes.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { EvalCaseSchema, SuiteSchema } from '../cases';
import {
  loadBazaarLabels,
  loadCategories,
  loadCommerceTexts,
  loadE2e,
  loadIntents,
} from '../datasets/fixtures';
import { readJsonl } from '../jsonl';
import { PATHS } from '../paths';

const problems: string[] = [];
const check = (what: string, fn: () => void) => {
  try {
    fn();
  } catch (err) {
    problems.push(`${what}: ${err instanceof Error ? err.message : String(err)}`);
  }
};

check('fixtures/categories.json', () => loadCategories());
check('fixtures/commerce-texts.json', () => loadCommerceTexts());
check('fixtures/e2e.jsonl', () => loadE2e());
check('fixtures/intents.json', () => {
  const categories = loadCategories();
  for (const intent of loadIntents()) {
    if (!categories[intent.category])
      throw new Error(`${intent.id}: unknown category ${intent.category}`);
  }
});
check('fixtures/bazaar-labels.json', () => {
  const categories = loadCategories();
  for (const label of loadBazaarLabels()) {
    if (!categories[label.category])
      throw new Error(`${label.carrierId}: unknown category ${label.category}`);
  }
});

const ids = new Set<string>();
const groupSplit = new Map<string, string>();
const counts: Record<string, Record<string, number>> = {};
for (const suite of SuiteSchema.options) {
  const file = join(PATHS.cases, `${suite}.jsonl`);
  if (!existsSync(file)) {
    problems.push(`${suite}.jsonl missing: run npm run eval:build`);
    continue;
  }
  check(`${suite}.jsonl`, () => {
    for (const c of readJsonl(file, EvalCaseSchema)) {
      if (c.suite !== suite) throw new Error(`${c.id} is ${c.suite}`);
      if (ids.has(c.id)) throw new Error(`duplicate id ${c.id}`);
      ids.add(c.id);
      const key = `${suite}:${c.group}`;
      const seen = groupSplit.get(key);
      if (seen && seen !== c.split) throw new Error(`group ${c.group} is in both dev and test`);
      groupSplit.set(key, c.split);
      // Labels and expectations must never be part of what Jev sees.
      const state = JSON.stringify(c.screenState);
      if (state.includes('"expected"') || state.includes('"labels"')) {
        throw new Error(`${c.id}: screenState contains evaluation fields`);
      }
      counts[suite] ??= { dev: 0, test: 0 };
      counts[suite][c.split]!++;
    }
  });
}

console.table(counts);
if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log('All cases and fixtures are valid.');
