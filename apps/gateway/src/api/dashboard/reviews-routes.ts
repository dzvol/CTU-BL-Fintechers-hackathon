import {
  ApproveInputSchema,
  ReviewIdSchema,
  ReviewStatusSchema,
  type ListResponse,
  type Review,
} from '@semanticauth/contracts';
import { Hono } from 'hono';
import type { UserEnv } from '../../auth/request-context';
import type { ApprovalService } from '../../services/approval/approval-service';
import type { ReviewService } from '../../services/review/review-service';
import { parse, parseOptionalJsonBody } from '../validate';

/** /api/reviews: operations waiting for the user's decision. */
export function createReviewsRoutes(reviews: ReviewService, approvals: ApprovalService) {
  return new Hono<UserEnv>()
    .get('/', (c) => {
      const status = parse(ReviewStatusSchema.optional(), c.req.query('status'));
      return c.json<ListResponse<Review>>({
        items: reviews.listForUser(c.var.auth.userId, { status }),
      });
    })
    .post('/:id/approve', async (c) => {
      const id = parse(ReviewIdSchema, c.req.param('id'));
      const { proof } = await parseOptionalJsonBody(c, ApproveInputSchema);
      return c.json(await approvals.approveReview(c.var.auth.userId, id, proof));
    })
    .post('/:id/reject', (c) =>
      c.json(reviews.reject(c.var.auth.userId, parse(ReviewIdSchema, c.req.param('id')))),
    );
}
