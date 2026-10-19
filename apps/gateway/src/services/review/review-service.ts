import {
  newId,
  type CheckReviewResult,
  type NormalizedOffer,
  type OperationId,
  type Review,
  type ReviewId,
  type ReviewStatus,
  type UserId,
  type VerdictReason,
} from '@semanticauth/contracts';
import type {
  OperationRecord,
  OperationRepository,
  ReviewRecord,
  ReviewRepository,
  Transaction,
} from '../../adapters/store';
import type { AgentContext } from '../context';
import { ConflictError, ForbiddenError, NotFoundError } from '../errors';

/** A REVIEW waits at most this long for the user, then expires without payment. */
export const REVIEW_TTL_MS = 5 * 60 * 1000;
/** After the user approves, the agent has this long to call paid_fetch again. */
export const APPROVAL_TTL_MS = 5 * 60 * 1000;

export interface ReviewService {
  checkForAgent(agent: AgentContext, operationId: OperationId): CheckReviewResult;
  listForUser(userId: UserId, filter: { status?: ReviewStatus }): Review[];
  approve(userId: UserId, reviewId: ReviewId): Review;
  reject(userId: UserId, reviewId: ReviewId): Review;

  // Internal, used by PaymentGateway.
  /** Call inside the transaction that moved the operation to awaiting_review. */
  open(
    operation: OperationRecord,
    decision: { reason: VerdictReason; detail: string },
    offer: NormalizedOffer,
  ): ReviewRecord;
  findForOperation(operationId: OperationId): ReviewRecord | undefined;
  /** Expires reviews that can no longer go on and closes their operations. */
  expireStale(): void;
}

const AGENT_MESSAGE: Record<ReviewStatus, string> = {
  pending: 'The user has not decided yet. Poll check_review again in a few seconds.',
  approved: `Approved. Call paid_fetch again with the same URL within ${APPROVAL_TTL_MS / 60_000} minutes to pay.`,
  rejected: 'The user rejected this purchase. Nothing was paid; do not buy it.',
  expired: 'The review expired. Nothing was paid; do not retry this URL in this task.',
};

export function createReviewService(deps: {
  reviews: ReviewRepository;
  operations: OperationRepository;
  transaction: Transaction;
  now?: () => Date;
}): ReviewService {
  const now = deps.now ?? (() => new Date());
  const later = (ms: number) => new Date(now().getTime() + ms).toISOString();

  const toReview = (record: ReviewRecord): Review => ({
    id: record.id,
    operationId: record.operationId,
    status: record.status,
    reason: record.reason,
    offer: record.offer,
    url: deps.operations.findById(record.operationId)?.url,
    detail: record.detail,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    decidedAt: record.decidedAt ?? undefined,
  });

  /** Ends a review's operation; throws (rolling back the transaction) if it already moved on. */
  const closeOperation = (review: ReviewRecord, message: string, at: string) => {
    if (
      !deps.operations.transition(review.operationId, 'awaiting_review', 'closed', { message }, at)
    ) {
      throw new Error(`Operation ${review.operationId} is no longer awaiting review`);
    }
  };

  // Expiry is applied lazily: every read first expires reviews that can't go on.
  function expireStale() {
    const at = now().toISOString();
    for (const review of deps.reviews.listStale(at)) {
      const why =
        review.expiresAt > at
          ? 'The task ended before the review finished'
          : review.status === 'pending'
            ? 'The user did not decide in time'
            : 'The approval was not used in time';
      deps.transaction(() => {
        if (deps.reviews.expire(review.id)) closeOperation(review, `${why}. Nothing was paid.`, at);
      });
    }
  }

  const owned = (userId: UserId, reviewId: ReviewId) => {
    expireStale();
    const review = deps.reviews.findById(reviewId);
    if (!review) throw new NotFoundError('Review');
    if (review.userId !== userId) throw new ForbiddenError('Review');
    if (review.status !== 'pending') {
      throw new ConflictError('review_not_pending', `Review is already ${review.status}`);
    }
    return review;
  };

  const decided = (reviewId: ReviewId) => toReview(deps.reviews.findById(reviewId)!);

  return {
    checkForAgent(agent, operationId) {
      expireStale();
      const operation = deps.operations.findById(operationId);
      if (!operation) throw new NotFoundError('Operation');
      if (operation.userId !== agent.userId) throw new ForbiddenError('Operation');
      const review = deps.reviews.findByOperation(operationId);
      if (!review) throw new NotFoundError('Review');
      const used = review.status === 'approved' && operation.state !== 'awaiting_review';
      return {
        operationId,
        status: review.status,
        message: used
          ? `Approved and already used; the operation is ${operation.state}.`
          : AGENT_MESSAGE[review.status],
      };
    },

    listForUser(userId, { status }) {
      expireStale();
      return deps.reviews.listByUser(userId, status).map(toReview);
    },

    approve(userId, reviewId) {
      const review = owned(userId, reviewId);
      // The operation stays awaiting_review until the agent resumes it with paid_fetch.
      if (
        !deps.reviews.decide(review.id, 'approved', now().toISOString(), later(APPROVAL_TTL_MS))
      ) {
        throw new ConflictError('review_not_pending', 'Review was decided concurrently');
      }
      return decided(review.id);
    },

    reject(userId, reviewId) {
      const review = owned(userId, reviewId);
      const at = now().toISOString();
      deps.transaction(() => {
        if (!deps.reviews.decide(review.id, 'rejected', at, review.expiresAt)) {
          throw new ConflictError('review_not_pending', 'Review was decided concurrently');
        }
        closeOperation(review, 'The user rejected this purchase. Nothing was paid.', at);
      });
      return decided(review.id);
    },

    open(operation, decision, offer) {
      const record: ReviewRecord = {
        id: newId('rev'),
        operationId: operation.id,
        userId: operation.userId,
        taskId: operation.taskId,
        status: 'pending',
        reason: decision.reason,
        offer,
        detail: decision.detail,
        createdAt: now().toISOString(),
        expiresAt: later(REVIEW_TTL_MS),
        decidedAt: null,
      };
      deps.reviews.insert(record);
      return record;
    },

    findForOperation: (operationId) => deps.reviews.findByOperation(operationId),

    expireStale,
  };
}
