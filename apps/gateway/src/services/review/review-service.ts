import type {
  CheckReviewResult,
  OperationId,
  Review,
  ReviewId,
  ReviewStatus,
  UserId,
} from '@semanticauth/contracts';
import type { AgentContext } from '../context';
import { notImplemented } from '../errors';

/** A REVIEW waits at most this long for the user, then expires without payment. */
export const REVIEW_TTL_MS = 5 * 60 * 1000;

export interface ReviewService {
  checkForAgent(agent: AgentContext, operationId: OperationId): CheckReviewResult;
  listForUser(userId: UserId, filter: { status?: ReviewStatus }): Review[];
  approve(userId: UserId, reviewId: ReviewId): Review;
  reject(userId: UserId, reviewId: ReviewId): Review;
}

// TODO: implement (ReviewService). Until then every call answers 501.
export function createReviewService(): ReviewService {
  return {
    checkForAgent: notImplemented('review.checkForAgent'),
    listForUser: notImplemented('review.listForUser'),
    approve: notImplemented('review.approve'),
    reject: notImplemented('review.reject'),
  };
}
