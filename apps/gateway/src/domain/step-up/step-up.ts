import { createHash } from 'node:crypto';
import type {
  Address,
  Amount,
  IntentId,
  OperationId,
  PasskeyId,
  ReviewId,
  UserId,
} from '@semanticauth/contracts';

/**
 * The facts a passkey confirms, taken from the gateway's own records. The challenge the
 * authenticator signs is derived from them, so a signature confirms exactly this action.
 */
export type StepUpFacts =
  | {
      type: 'approve_intent';
      intentId: IntentId;
      purpose: string;
      budget: Amount;
      maxPerPurchase: Amount;
      plannedPurchases: number;
    }
  | {
      type: 'approve_review';
      reviewId: ReviewId;
      operationId: OperationId;
      url: string;
      amount: Amount;
      asset: Address;
      network: string;
      payTo: Address;
    }
  | { type: 'add_passkey'; userId: UserId }
  | { type: 'remove_passkey'; passkeyId: PasskeyId };

const CHALLENGE_DOMAIN = 'semanticauth-step-up-v1';

/** JSON with object keys sorted at every level, so equal facts always give the same string. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => [k, sortKeys(v)]),
  );
}

/** base64url SHA-256 over a fresh nonce and the canonical action. */
export function deriveChallenge(nonce: string, action: string): string {
  return createHash('sha256')
    .update(`${CHALLENGE_DOMAIN}\n${nonce}\n${action}`)
    .digest('base64url');
}
