import {
  ReviewIdSchema,
  ReviewStatusSchema,
  type ListResponse,
  type Review,
} from '@semanticauth/contracts';
import { Hono } from 'hono';
import type { UserEnv } from '../../auth/request-context';
import type { ReviewService } from '../../services/review/review-service';
import { parse } from '../validate';

/** /api/reviews: operations waiting for the user's decision. */
export function createReviewsRoutes(reviews: ReviewService) {
  return new Hono<UserEnv>()
    .get('/', (c) => {
      const status = parse(ReviewStatusSchema.optional(), c.req.query('status'));
      return c.json<ListResponse<Review>>({
        items: reviews.listForUser(c.var.auth.userId, { status }),
      });
    })
    .post('/:id/approve', (c) =>
      c.json(reviews.approve(c.var.auth.userId, parse(ReviewIdSchema, c.req.param('id')))),
    )
    .post('/:id/reject', (c) =>
      c.json(reviews.reject(c.var.auth.userId, parse(ReviewIdSchema, c.req.param('id')))),
    );
}
