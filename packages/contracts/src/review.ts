import { z } from 'zod';
import { OperationIdSchema, ReviewIdSchema, TimestampSchema } from './ids';
import { NormalizedOfferSchema } from './operation';
import { VerdictReasonSchema } from './verdict';

export const ReviewStatusSchema = z.enum(['pending', 'approved', 'rejected', 'expired']);
export type ReviewStatus = z.infer<typeof ReviewStatusSchema>;

/** User approval of one specific operation. Decided only in the dashboard. */
export const ReviewSchema = z.object({
  id: ReviewIdSchema,
  operationId: OperationIdSchema,
  status: ReviewStatusSchema,
  reason: VerdictReasonSchema,
  offer: NormalizedOfferSchema,
  createdAt: TimestampSchema,
  expiresAt: TimestampSchema,
  decidedAt: TimestampSchema.optional(),
});
export type Review = z.infer<typeof ReviewSchema>;
