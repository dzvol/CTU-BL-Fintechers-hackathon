// Loaders for the committed, person-checked inputs in eval/fixtures.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { EvalCaseSchema, ExtractionSchema, IntentFixtureSchema, type EvalCase } from '../cases';
import { readJson } from '../jsonl';
import { PATHS } from '../paths';
import { splitOf } from '../random';

const fixture = (name: string) => join(PATHS.fixtures, name);

export const CategoriesSchema = z.object({
  author: z.string(),
  categories: z.record(
    z.string(),
    z.object({
      description: z.string(),
      /** Close enough that a pair with this category is ambiguous rather than off-intent. */
      adjacent: z.array(z.string()),
      /** The intent's forbidden rule that covers this category. */
      forbiddenBy: z.string().optional(),
    }),
  ),
});
export type Categories = z.infer<typeof CategoriesSchema>['categories'];

export const CommerceTextsSchema = z.object({
  author: z.string(),
  attacks: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(['injection', 'recipient_change', 'both']),
      text: z.string(),
    }),
  ),
  /** Honest merchant wording that mentions agents, approval, overrides… */
  benign: z.array(z.object({ id: z.string(), text: z.string() })),
});

/** A person's labels for one Bazaar offer: its category and the "oracle" extraction for Judge. */
export const BazaarLabelSchema = z.strictObject({
  carrierId: z.string(),
  category: z.string(),
  extraction: ExtractionSchema,
  author: z.string().min(1),
  notes: z.string().optional(),
});
export type BazaarLabel = z.infer<typeof BazaarLabelSchema>;

export const loadCategories = () =>
  readJson(fixture('categories.json'), CategoriesSchema).categories;
export const loadIntents = () => readJson(fixture('intents.json'), z.array(IntentFixtureSchema));
export const loadCommerceTexts = () =>
  readJson(fixture('commerce-texts.json'), CommerceTextsSchema);
export const loadBazaarLabels = () =>
  existsSync(fixture('bazaar-labels.json'))
    ? readJson(fixture('bazaar-labels.json'), z.array(BazaarLabelSchema))
    : [];

/** Hand-written end-to-end cases; `split` may be pinned (cases already used for tuning: dev). */
export function loadE2e(): EvalCase[] {
  const file = fixture('e2e.jsonl');
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line.trim())
    .map((line, i) => {
      const raw = JSON.parse(line) as { group?: string; split?: string };
      const parsed = EvalCaseSchema.safeParse({
        ...raw,
        split: raw.split ?? splitOf(raw.group ?? ''),
      });
      if (!parsed.success || parsed.data.suite !== 'e2e') {
        throw new Error(
          `e2e.jsonl:${i + 1}: ${parsed.success ? 'not an e2e case' : parsed.error.message}`,
        );
      }
      return parsed.data;
    });
}
