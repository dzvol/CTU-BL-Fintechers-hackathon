import { formatUsdc, type Intent, type NormalizedOffer, type Task } from '@semanticauth/contracts';
import { committed, type Purchase } from '../facts/facts';

export interface PolicyInput {
  offer: NormalizedOffer;
  intent: Intent;
  task: Task;
  /** The user's purchases that reserved or spent money, over all tasks. */
  purchases: Purchase[];
  /** The user's allocation from the sponsor pool. */
  allocation: bigint;
}

export type PolicyOutcome =
  | { ok: true }
  | {
      ok: false;
      reason: 'policy_limit_exceeded' | 'insufficient_allocation';
      /** Human-readable, for the operation message. Built from numbers only. */
      detail: string;
    };

/** Deterministic rules (max price, task budget, allocation, ...). Runs before Jev. */
export type Policy = (input: PolicyInput) => PolicyOutcome;

const usdc = (amount: bigint) => `${formatUsdc(amount)} USDC`;

/**
 * The limits of the approved intent and the user's allocation. The ledger's atomic reservation
 * re-checks the money later; Policy is the early check that keeps Jev from being called at all.
 */
export const defaultPolicy: Policy = ({ offer, intent, task, purchases, allocation }) => {
  const amount = BigInt(offer.amount);
  const maxPerPurchase = BigInt(intent.maxPerPurchase);
  const budget = BigInt(task.budget);
  const used = committed(task, purchases);
  const limit = (detail: string) =>
    ({ ok: false, reason: 'policy_limit_exceeded', detail }) as const;

  if (amount <= 0n) return limit('the price is not a positive amount');
  if (amount > maxPerPurchase) {
    return limit(`${usdc(amount)} is over the max per purchase of ${usdc(maxPerPurchase)}`);
  }
  if (used.task + amount > budget) {
    return limit(
      `${usdc(amount)} does not fit the task budget (${usdc(budget - used.task)} of ${usdc(budget)} left)`,
    );
  }
  if (used.purchasesInTask >= intent.plannedPurchases) {
    return limit(`the task already made all ${intent.plannedPurchases} planned purchases`);
  }
  if (used.user + amount > allocation) {
    return {
      ok: false,
      reason: 'insufficient_allocation',
      detail: `${usdc(amount)} does not fit your allocation (${usdc(allocation - used.user)} left)`,
    };
  }
  return { ok: true };
};
