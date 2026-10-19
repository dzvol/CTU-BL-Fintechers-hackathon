import { z } from 'zod';
import { IntentIdSchema, TaskIdSchema, TimestampSchema, UserIdSchema } from './ids';
import { AmountSchema, UsdcDecimalSchema } from './money';

export const IntentStatusSchema = z.enum(['pending_approval', 'approved', 'rejected', 'expired']);
export type IntentStatus = z.infer<typeof IntentStatusSchema>;

/** What the agent submits via `submit_intent`. Amounts are human USDC strings. */
export const IntentProposalSchema = z.object({
  /** Why the agent needs to buy anything, e.g. "Buy market data for a research note". */
  purpose: z.string().min(1).max(500),
  /** The user's task in their own words; Judge compares purchases against it. */
  task: z.string().min(1).max(2000),
  /** What kinds of purchases are in scope. */
  allowedPurchases: z.array(z.string().min(1)).min(1),
  /** What must never be bought. */
  forbidden: z.array(z.string().min(1)).default([]),
  budgetUsdc: UsdcDecimalSchema,
  maxPerPurchaseUsdc: UsdcDecimalSchema,
  /** How many purchases the agent expects to make. */
  plannedPurchases: z.number().int().positive().optional(),
});
export type IntentProposal = z.infer<typeof IntentProposalSchema>;

/** Stored intent. Immutable once approved. */
export const IntentSchema = z.object({
  id: IntentIdSchema,
  userId: UserIdSchema,
  status: IntentStatusSchema,
  purpose: z.string(),
  task: z.string(),
  allowedPurchases: z.array(z.string()),
  forbidden: z.array(z.string()),
  budget: AmountSchema,
  maxPerPurchase: AmountSchema,
  plannedPurchases: z.number().int().positive().optional(),
  /** Set once approved. */
  taskId: TaskIdSchema.optional(),
  createdAt: TimestampSchema,
  expiresAt: TimestampSchema,
  decidedAt: TimestampSchema.optional(),
});
export type Intent = z.infer<typeof IntentSchema>;
