import type {
  Intent,
  IntentId,
  PasskeyProof,
  Review,
  ReviewId,
  UserId,
} from '@semanticauth/contracts';
import type { IntentService } from '../intent/intent-service';
import type { PasskeyService } from '../passkey/passkey-service';
import type { ReviewService } from '../review/review-service';

/**
 * Dashboard approvals. The passkey proof is checked first and consumed in the same transaction
 * as the approval, so an approval never happens without a valid proof once passkeys are required.
 * Reject needs no passkey: it can never move money.
 */
export interface ApprovalService {
  approveIntent(userId: UserId, intentId: IntentId, proof?: PasskeyProof): Promise<Intent>;
  approveReview(userId: UserId, reviewId: ReviewId, proof?: PasskeyProof): Promise<Review>;
}

export function createApprovalService(deps: {
  passkeys: PasskeyService;
  intents: IntentService;
  reviews: ReviewService;
}): ApprovalService {
  return {
    approveIntent: (userId, intentId, proof) =>
      deps.passkeys.confirm(userId, { type: 'approve_intent', intentId }, proof, (passkeyId) =>
        deps.intents.approve(userId, intentId, passkeyId),
      ),
    approveReview: (userId, reviewId, proof) =>
      deps.passkeys.confirm(userId, { type: 'approve_review', reviewId }, proof, (passkeyId) =>
        deps.reviews.approve(userId, reviewId, passkeyId),
      ),
  };
}
