import type { OperationState } from '@semanticauth/contracts';

/** Allowed transitions of the operation lifecycle (docs/architecture/overview.md). */
const TRANSITIONS: Record<OperationState, readonly OperationState[]> = {
  // Free content (HTTP 2xx) goes straight to delivered.
  requested: ['blocked', 'awaiting_review', 'reserved', 'delivered'],
  awaiting_review: ['reserved', 'closed'],
  // Anything failing before the authorization leaves the gateway is blocked (nothing was paid).
  reserved: ['prepared', 'blocked'],
  prepared: ['issued', 'blocked'],
  // From issued on the payment may have happened: never back to blocked.
  issued: ['submitted', 'unknown'],
  submitted: ['settled', 'unknown'],
  unknown: ['settled', 'closed'],
  settled: ['delivered', 'delivery_failed'],
  blocked: [],
  closed: [],
  delivered: [],
  delivery_failed: [],
};

export function canTransition(from: OperationState, to: OperationState): boolean {
  return TRANSITIONS[from].includes(to);
}

export function isTerminal(state: OperationState): boolean {
  return TRANSITIONS[state].length === 0;
}

/**
 * Where a failure in `state` leads. Before the authorization is issued nothing can have been
 * paid, so the operation is blocked (or closed, when resuming an approved review failed);
 * afterwards the outcome is unknown and counts as spent.
 */
export function failureState(state: OperationState): 'blocked' | 'closed' | 'unknown' | undefined {
  if (canTransition(state, 'blocked')) return 'blocked';
  if (state === 'awaiting_review') return 'closed';
  if (canTransition(state, 'unknown')) return 'unknown';
  return undefined;
}
