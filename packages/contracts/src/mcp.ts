import { z } from 'zod';
import { IntentIdSchema, OperationIdSchema, ReviewIdSchema, TaskIdSchema } from './ids';
import { AmountSchema } from './money';
import { IntentStatusSchema } from './intent';
import { OperationStateSchema, SettlementSchema } from './operation';
import { ReviewStatusSchema } from './review';
import { TaskSchema } from './task';
import { VerdictReasonSchema, VerdictSchema } from './verdict';

export { IntentProposalSchema as SubmitIntentInputSchema } from './intent';

export const MCP_TOOLS = [
  'get_intent_template',
  'submit_intent',
  'get_intent_status',
  'get_task',
  'paid_fetch',
  'check_review',
] as const;
export type McpToolName = (typeof MCP_TOOLS)[number];

export const SubmitIntentResultSchema = z.object({
  intentId: IntentIdSchema,
  status: z.literal('pending_approval'),
  /** Dashboard link the agent shows to the user. */
  approvalUrl: z.url(),
});
export type SubmitIntentResult = z.infer<typeof SubmitIntentResultSchema>;

export const GetIntentStatusInputSchema = z.object({ intentId: IntentIdSchema });
export type GetIntentStatusInput = z.infer<typeof GetIntentStatusInputSchema>;

export const GetIntentStatusResultSchema = z.object({
  intentId: IntentIdSchema,
  status: IntentStatusSchema,
  /** Present once approved. */
  taskId: TaskIdSchema.optional(),
  budget: AmountSchema.optional(),
});
export type GetIntentStatusResult = z.infer<typeof GetIntentStatusResultSchema>;

/** `get_task`: the active task of the calling API key, or null. */
export const GetTaskResultSchema = z.object({ task: TaskSchema.nullable() });
export type GetTaskResult = z.infer<typeof GetTaskResultSchema>;

/** No task id: the gateway resolves the active task from the API key. */
export const PaidFetchInputSchema = z.object({ url: z.url() });
export type PaidFetchInput = z.infer<typeof PaidFetchInputSchema>;

export const PaidFetchResultSchema = z.object({
  operationId: OperationIdSchema,
  state: OperationStateSchema,
  verdict: VerdictSchema.optional(),
  reason: VerdictReasonSchema.optional(),
  /** Present when state is awaiting_review. */
  reviewId: ReviewIdSchema.optional(),
  /** Present when content was delivered (paid or free). */
  content: z.string().optional(),
  contentType: z.string().optional(),
  settlement: SettlementSchema.optional(),
  /** Human-readable explanation for the agent. */
  message: z.string(),
});
export type PaidFetchResult = z.infer<typeof PaidFetchResultSchema>;

export const CheckReviewInputSchema = z.object({ operationId: OperationIdSchema });
export type CheckReviewInput = z.infer<typeof CheckReviewInputSchema>;

export const CheckReviewResultSchema = z.object({
  operationId: OperationIdSchema,
  status: ReviewStatusSchema,
  /** What the agent should do next. */
  message: z.string().optional(),
});
export type CheckReviewResult = z.infer<typeof CheckReviewResultSchema>;
