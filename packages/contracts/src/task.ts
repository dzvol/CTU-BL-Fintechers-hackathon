import { z } from 'zod';
import { ApiKeyIdSchema, IntentIdSchema, TaskIdSchema, TimestampSchema, UserIdSchema } from './ids';
import { AmountSchema } from './money';

export const TaskStatusSchema = z.enum(['active', 'expired', 'closed']);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const TaskSchema = z.object({
  id: TaskIdSchema,
  intentId: IntentIdSchema,
  userId: UserIdSchema,
  apiKeyId: ApiKeyIdSchema,
  status: TaskStatusSchema,
  budget: AmountSchema,
  /** Settled or counted as spent (issued and later). */
  spent: AmountSchema,
  /** Held by reservations not yet spent. */
  reserved: AmountSchema,
  createdAt: TimestampSchema,
  /** An active task stops being usable at this time. */
  expiresAt: TimestampSchema,
  closedAt: TimestampSchema.optional(),
});
export type Task = z.infer<typeof TaskSchema>;
