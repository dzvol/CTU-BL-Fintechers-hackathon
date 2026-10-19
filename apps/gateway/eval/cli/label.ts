// Labeling Bazaar offers for the Judge suite. People fill a worksheet; this script only prepares,
// merges and compares it. It never fills a label itself.
//
//   npm run eval:label -- --count 200        worksheet with offers not labeled yet
//   npm run eval:label -- --merge            move complete entries into fixtures/bazaar-labels.json
//   npm run eval:label -- --agreement <file> Cohen's kappa against a second person's worksheet
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { SCREEN_QUESTIONS } from '../../src/domain/jev/screen-questions';
import { bazaarCarriers } from '../datasets/bazaar';
import { BazaarLabelSchema, loadBazaarLabels, loadCategories } from '../datasets/fixtures';
import { writeJson } from '../jsonl';
import { cohensKappa } from '../metrics';
import { PATHS } from '../paths';
import { seededRandom } from '../random';
import { fail, parseArgs } from './args';

const args = parseArgs();
const TODO = join(PATHS.labeling, 'bazaar-todo.json');
const FIXTURE = join(PATHS.fixtures, 'bazaar-labels.json');

const EXTRACTION_FIELDS = [
  'offer_type',
  'product_function',
  'deliverable_kind',
  'billing_basis',
  'counterparty_type',
] as const;

if (args.has('merge')) {
  if (!existsSync(TODO)) fail(`No worksheet at ${TODO}`);
  const rows = JSON.parse(readFileSync(TODO, 'utf8')) as Record<string, unknown>[];
  const existing = loadBazaarLabels();
  const known = new Set(existing.map((l) => l.carrierId));
  const merged = [...existing];
  const incomplete: string[] = [];
  for (const row of rows) {
    const parsed = BazaarLabelSchema.safeParse({
      carrierId: row.carrierId,
      category: row.category,
      extraction: row.extraction,
      author: row.author,
      ...(row.notes ? { notes: row.notes } : {}),
    });
    if (!parsed.success || !loadCategories()[parsed.data.category]) {
      incomplete.push(String(row.carrierId));
      continue;
    }
    if (!known.has(parsed.data.carrierId)) merged.push(parsed.data);
  }
  writeJson(FIXTURE, merged);
  console.log(`${merged.length - existing.length} merged, ${merged.length} labeled in total.`);
  if (incomplete.length) console.log(`${incomplete.length} incomplete rows left in the worksheet.`);
} else if (args.get('agreement')) {
  const other = z
    .array(z.object({ carrierId: z.string(), category: z.string() }))
    .parse(JSON.parse(readFileSync(args.get('agreement')!, 'utf8')));
  const mine = new Map(loadBazaarLabels().map((l) => [l.carrierId, l.category]));
  const both = other.filter((o) => mine.has(o.carrierId) && o.category);
  const kappa = cohensKappa(
    both.map((o) => mine.get(o.carrierId)!),
    both.map((o) => o.category),
  );
  console.log(`Category agreement on ${both.length} offers: Cohen's κ = ${kappa.toFixed(3)}`);
  for (const o of both.filter((o) => mine.get(o.carrierId) !== o.category)) {
    console.log(`  ${o.carrierId}: ${mine.get(o.carrierId)} vs ${o.category}`);
  }
} else {
  const count = Number(args.get('count') ?? 200);
  const labeled = new Set(loadBazaarLabels().map((l) => l.carrierId));
  const pending = seededRandom('labeling')
    .sample(bazaarCarriers(), Number.MAX_SAFE_INTEGER)
    .filter((c) => !labeled.has(c.id))
    .slice(0, count);
  const options = Object.fromEntries(
    EXTRACTION_FIELDS.map((f) => [
      f,
      Object.keys((SCREEN_QUESTIONS[f] as { criteria: object }).criteria),
    ]),
  );
  writeJson(join(PATHS.labeling, 'allowed-values.json'), {
    category: loadCategories(),
    extraction: { ...options, contains_personal_data: ['yes', 'no'] },
    guide:
      'Label from the text only, as a careful buyer would. Unsure → "unknown" / category "other".',
  });
  writeJson(
    TODO,
    pending.map((c) => ({
      carrierId: c.id,
      serviceName: c.serviceName ?? null,
      url: c.url,
      description: c.description,
      category: '',
      extraction: {
        ...Object.fromEntries(EXTRACTION_FIELDS.map((f) => [f, ''])),
        contains_personal_data: '',
      },
      author: '',
      notes: '',
    })),
  );
  console.log(`${pending.length} offers to label in ${TODO}`);
  console.log(`Allowed values: ${join(PATHS.labeling, 'allowed-values.json')}`);
}
