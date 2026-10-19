import type { Verdict, VerdictReason } from '@semanticauth/contracts';
import type { PolicyOutcome } from '../policy/policy';

// TODO(jev): placeholder outcome shapes; the Jev step defines the real Screen/Judge outputs.

/** Manipulation signals Screen found in the merchant text. */
export type ScreenSignal =
  'prompt_injection' | 'recipient_change' | 'subscription' | 'suspicious_offer';

export interface ScreenOutcome {
  signals: ScreenSignal[];
}

export interface JudgeOutcome {
  /** Whether the purchase fits the approved intent and mandate. */
  fitsIntent: boolean;
}

export interface Decision {
  verdict: Verdict;
  reason: VerdictReason;
}

/**
 * Decision table: turns Policy, Screen and Judge results into the final verdict. Pure, no money.
 * Screen and Judge are absent when Policy blocked (Jev is never called then).
 */
export function decide(input: {
  policy: PolicyOutcome;
  screen?: ScreenOutcome;
  judge?: JudgeOutcome;
}): Decision {
  const { policy, screen, judge } = input;
  if (!policy.ok) return { verdict: 'BLOCK', reason: policy.reason };
  // Fail closed: without both semantic checks there is no ALLOW.
  if (!screen || !judge) return { verdict: 'BLOCK', reason: 'jev_unavailable' };
  if (screen.signals.includes('prompt_injection')) {
    return { verdict: 'BLOCK', reason: 'prompt_injection' };
  }
  if (!judge.fitsIntent) return { verdict: 'BLOCK', reason: 'off_intent' };
  for (const signal of ['recipient_change', 'subscription', 'suspicious_offer'] as const) {
    if (screen.signals.includes(signal)) return { verdict: 'REVIEW', reason: signal };
  }
  return { verdict: 'ALLOW', reason: 'within_intent' };
}
