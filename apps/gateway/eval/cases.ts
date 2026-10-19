// The one format every evaluation source is turned into. Role B produces these, role A runs them.
// Change it only through a PR by role A (see README.md).
import { AmountSchema, VerdictReasonSchema, VerdictSchema } from '@semanticauth/contracts';
import { z } from 'zod';
import { SCREEN_QUESTIONS } from '../src/domain/jev/screen-questions';

export const SuiteSchema = z.enum(['screen-benign', 'screen-injection', 'judge-pairs', 'e2e']);
export type Suite = z.infer<typeof SuiteSchema>;

export const SplitSchema = z.enum(['dev', 'test']);
export type Split = z.infer<typeof SplitSchema>;

/** Exactly what Screen receives in production (see src/domain/jev/state.ts). */
export const ScreenStateSchema = z.strictObject({
  resource: z.strictObject({
    url: z.string(),
    serviceName: z.string().optional(),
    description: z.string().optional(),
  }),
  response_body_excerpt: z.json().optional(),
});

/** An approved intent, as the user would have approved it. */
export const IntentFixtureSchema = z.strictObject({
  id: z.string(),
  category: z.string(),
  purpose: z.string().min(1),
  task: z.string().min(1),
  allowedPurchases: z.array(z.string()).min(1),
  forbidden: z.array(z.string()).min(1),
  budget: AmountSchema,
  maxPerPurchase: AmountSchema,
  plannedPurchases: z.number().int().positive(),
  author: z.string(),
});
export type IntentFixture = z.infer<typeof IntentFixtureSchema>;

export const OfferSchema = z.strictObject({
  amount: AmountSchema,
  payTo: z.string(),
  resourceUrl: z.string(),
});

/** An earlier purchase that reserved or spent money; `sameTask` false = an earlier task. */
export const PurchaseFixtureSchema = z.strictObject({
  payTo: z.string(),
  amount: AmountSchema,
  sameTask: z.boolean(),
});

const choice = <K extends keyof typeof SCREEN_QUESTIONS>(key: K) =>
  z.enum(
    Object.keys((SCREEN_QUESTIONS[key] as { criteria: object }).criteria) as [string, ...string[]],
  );

/** Screen's extraction, written by a person: the "oracle" input for Judge. */
export const ExtractionSchema = z.strictObject({
  offer_type: choice('offer_type'),
  product_function: choice('product_function'),
  deliverable_kind: choice('deliverable_kind'),
  billing_basis: choice('billing_basis'),
  counterparty_type: choice('counterparty_type'),
  contains_personal_data: z.enum(['yes', 'no']),
});

/** Free-form facts for slicing results. Never reaches Jev. */
const LabelsSchema = z.record(z.string(), z.json());

const base = {
  id: z.string().min(1),
  split: SplitSchema,
  /** Unit of the dev/test split: cases sharing a group never land in different splits. */
  group: z.string().min(1),
  /** Where it came from, with version: "InjecAgent@<commit>", "x402-bazaar@2026-10-19". */
  source: z.string().min(1),
  /** Who wrote or checked the expected outcome: a person, or "construction". */
  author: z.string().min(1),
  screenState: ScreenStateSchema,
  labels: LabelsSchema.default({}),
};

export const EvalCaseSchema = z.discriminatedUnion('suite', [
  z.strictObject({
    ...base,
    suite: z.literal('screen-benign'),
    expected: z.strictObject({ injection: z.literal(false), recipientChange: z.literal(false) }),
  }),
  z.strictObject({
    ...base,
    suite: z.literal('screen-injection'),
    expected: z.strictObject({ injection: z.boolean(), recipientChange: z.boolean() }),
  }),
  z.strictObject({
    ...base,
    suite: z.literal('judge-pairs'),
    intent: IntentFixtureSchema,
    offer: OfferSchema,
    oracleExtraction: ExtractionSchema,
    expected: z.strictObject({
      /** fits = needed/supports and within purpose; ambiguous cases are reported apart. */
      relation: z.enum(['fits', 'off_intent', 'forbidden', 'ambiguous']),
    }),
  }),
  z.strictObject({
    ...base,
    suite: z.literal('e2e'),
    intent: IntentFixtureSchema,
    offer: OfferSchema,
    purchases: z.array(PurchaseFixtureSchema).default([]),
    expected: z.strictObject({
      verdict: VerdictSchema,
      /** Other verdicts that are also acceptable for this case (e.g. REVIEW for a borderline). */
      acceptable: z.array(VerdictSchema).default([]),
      reason: VerdictReasonSchema.optional(),
      /** Reported apart from the headline numbers. */
      ambiguous: z.boolean().default(false),
    }),
  }),
]);
export type EvalCase = z.infer<typeof EvalCaseSchema>;
export type EvalCaseOf<S extends Suite> = Extract<EvalCase, { suite: S }>;
