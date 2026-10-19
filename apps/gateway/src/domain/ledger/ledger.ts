import type { VerdictReason } from '@semanticauth/contracts';

/**
 * Sponsored ledger: pure bookkeeping for the shared sponsor pool. All amounts are USDC atomic
 * units as bigint. The store keeps one entry per operation; this module decides what fits.
 */

/** reserved → spent (from `issued` on) | released; spent → released only after reconciliation. */
export type LedgerEntryState = 'reserved' | 'spent' | 'released';

/** A spending limit and what already counts against it. */
export interface Balance {
  limit: bigint;
  spent: bigint;
  reserved: bigint;
}

export type ReservationRejectReason =
  'invalid_amount' | 'task_budget_exceeded' | 'insufficient_allocation' | 'sponsor_pool_exhausted';

export type ReservationCheck = { ok: true } | { ok: false; reason: ReservationRejectReason };

export interface ReservationCheckInput {
  amount: bigint;
  task: Balance;
  user: Balance;
  pool: Balance;
}

/** What is still available; never negative even if a limit was lowered below current use. */
export function remaining(balance: Balance): bigint {
  const left = balance.limit - balance.spent - balance.reserved;
  return left > 0n ? left : 0n;
}

/**
 * Decides whether `amount` can be reserved. Checked narrowest first, so the reason names the
 * limit the user can actually act on (task budget before personal allocation before the pool).
 */
export function checkReservation(input: ReservationCheckInput): ReservationCheck {
  if (input.amount <= 0n) return { ok: false, reason: 'invalid_amount' };
  if (input.amount > remaining(input.task)) return { ok: false, reason: 'task_budget_exceeded' };
  if (input.amount > remaining(input.user)) return { ok: false, reason: 'insufficient_allocation' };
  if (input.amount > remaining(input.pool)) return { ok: false, reason: 'sponsor_pool_exhausted' };
  return { ok: true };
}

const TRANSITIONS: Record<LedgerEntryState, readonly LedgerEntryState[]> = {
  reserved: ['spent', 'released'],
  // Only reconciliation may undo spending, once it proves the payment never settled.
  spent: ['released'],
  released: [],
};

export function canTransition(from: LedgerEntryState, to: LedgerEntryState): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Maps a ledger rejection onto the shared verdict reasons for the BLOCK result. */
export function toVerdictReason(reason: ReservationRejectReason): VerdictReason {
  return reason === 'insufficient_allocation' ? 'insufficient_allocation' : 'policy_limit_exceeded';
}

/** Sums entries into spent/reserved; released entries no longer count. */
export function sumEntries(entries: readonly { state: LedgerEntryState; amount: bigint }[]): {
  spent: bigint;
  reserved: bigint;
} {
  let spent = 0n;
  let reserved = 0n;
  for (const entry of entries) {
    if (entry.state === 'spent') spent += entry.amount;
    else if (entry.state === 'reserved') reserved += entry.amount;
  }
  return { spent, reserved };
}
