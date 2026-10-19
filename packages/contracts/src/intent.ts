import { z } from 'zod';
import { ApiKeyIdSchema, IntentIdSchema, TaskIdSchema, TimestampSchema, UserIdSchema } from './ids';
import { AmountSchema, UsdcDecimalSchema } from './money';

export const IntentStatusSchema = z.enum(['pending_approval', 'approved', 'rejected', 'expired']);
export type IntentStatus = z.infer<typeof IntentStatusSchema>;

/**
 * What the agent submits via `submit_intent`. Every field is required and there are no defaults:
 * each intent is written for one specific job. The descriptions are what the agent sees.
 */
export const IntentProposalSchema = z.strictObject({
  purpose: z.string().min(1).max(500).describe('Why you need to buy anything, in one sentence.'),
  task: z
    .string()
    .min(1)
    .max(2000)
    .describe("The user's request in their own words. Purchases are judged against it."),
  allowedPurchases: z
    .array(z.string().min(1))
    .min(1)
    .describe('Kinds of products or services you may buy for this task, one per item.'),
  forbidden: z
    .array(z.string().min(1))
    .min(1)
    .describe('Kinds of purchases that must never happen for this task, one per item.'),
  budgetUsdc: UsdcDecimalSchema.describe('Total budget for the whole task in USDC, e.g. "1.50".'),
  maxPerPurchaseUsdc: UsdcDecimalSchema.describe(
    'Maximum price of a single purchase in USDC. Must not exceed budgetUsdc.',
  ),
  plannedPurchases: z
    .number()
    .int()
    .positive()
    .describe('How many purchases you expect to make for this task.'),
});
export type IntentProposal = z.infer<typeof IntentProposalSchema>;

/** Returned by `get_intent_template`: instructions plus the JSON Schema of IntentProposal. */
export const IntentTemplateSchema = z.object({
  instructions: z.string(),
  schema: z.record(z.string(), z.unknown()),
});
export type IntentTemplate = z.infer<typeof IntentTemplateSchema>;

/** Stored intent. Immutable once submitted; only its status changes. */
export const IntentSchema = z.object({
  id: IntentIdSchema,
  userId: UserIdSchema,
  /** The key that submitted it; the task is bound to this key. */
  apiKeyId: ApiKeyIdSchema,
  status: IntentStatusSchema,
  purpose: z.string(),
  task: z.string(),
  allowedPurchases: z.array(z.string()),
  forbidden: z.array(z.string()),
  budget: AmountSchema,
  maxPerPurchase: AmountSchema,
  plannedPurchases: z.number().int().positive(),
  /** Set once approved. */
  taskId: TaskIdSchema.optional(),
  createdAt: TimestampSchema,
  expiresAt: TimestampSchema,
  decidedAt: TimestampSchema.optional(),
});
export type Intent = z.infer<typeof IntentSchema>;
