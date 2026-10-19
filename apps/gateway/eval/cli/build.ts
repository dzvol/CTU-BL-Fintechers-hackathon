// npm run eval:build — sources + fixtures → eval/data/cases/<suite>.jsonl
import { buildAll } from '../datasets/build';

const counts = buildAll();
console.table(counts);
const pairs = counts['judge-pairs'];
if (!pairs || (pairs.dev ?? 0) + (pairs.test ?? 0) === 0) {
  console.log('judge-pairs is empty: label Bazaar offers first (npm run eval:label).');
}
