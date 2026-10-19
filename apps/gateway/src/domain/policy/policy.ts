import type { Intent, NormalizedOffer, Task } from '@semanticauth/contracts';

export interface PolicyInput {
  offer: NormalizedOffer;
  intent: Intent;
  task: Task;
}

export type PolicyOutcome =
  { ok: true } | { ok: false; reason: 'policy_limit_exceeded' | 'insufficient_allocation' };

/** Deterministic rules (max price, task budget, allocation, ...). Runs before Jev. */
export type Policy = (input: PolicyInput) => PolicyOutcome;

// TODO(policy): real rules. This stub lets every offer through to the semantic checks.
export const passThroughPolicy: Policy = () => ({ ok: true });
