import type { Verdict, VerdictReason } from '@semanticauth/contracts';
import type { JudgeAnswers } from '../jev/judge-questions';
import type { ScreenAnswers } from '../jev/screen-questions';
import { YES } from '../jev/state';
import type { PolicyOutcome } from '../policy/policy';

export interface Decision {
  verdict: Verdict;
  reason: VerdictReason;
  /** Which check decided, for the operation message. Never contains merchant text. */
  detail: string;
}

/**
 * Manipulation probability that blocks outright. Between YES and this the user reviews: a plain
 * "pay this address instead" scores about 0.5 on instruction_override, a real injection over 0.9.
 */
export const INJECTION = 0.8;

/** Judge's `severity` level at which a mistake would cost real money ("Significant"). */
export const SEVERE = 2;

/** Judge's options that let a purchase through. */
const APPROVING = {
  mandate_purpose: ['within_purpose'],
  mandate_rules: ['no_rule_applies', 'exception_applies'],
  task_relation: ['needed', 'supports'],
} as const;

/** Every tunable cut-off of the decision table, so the offline evaluation can tune them. */
export interface Thresholds {
  /** A noul answer at or above this counts as "yes". */
  yes: number;
  /** Manipulation probability that blocks outright (between `yes` and this: REVIEW). */
  injection: number;
  /** Judge's severity level that asks for a REVIEW. */
  severe: number;
  /** Probability Judge must give the approving options, by amount (USDC atomic units). */
  support: { upTo10Cents: number; upTo1Usdc: number; above: number };
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  yes: YES,
  injection: INJECTION,
  severe: SEVERE,
  support: { upTo10Cents: 0.6, upTo1Usdc: 0.75, above: 0.9 },
};

/**
 * The probability Judge must give the approving options of each question for an ALLOW; the more
 * money, the surer. Below that the user reviews the purchase.
 */
export function requiredSupport(amount: bigint, thresholds = DEFAULT_THRESHOLDS): number {
  if (amount <= 100_000n) return thresholds.support.upTo10Cents;
  if (amount <= 1_000_000n) return thresholds.support.upTo1Usdc;
  return thresholds.support.above;
}

/** Screen's yes/no questions. */
type ScreenFlag = {
  [K in keyof ScreenAnswers]: ScreenAnswers[K] extends number ? K : never;
}[keyof ScreenAnswers];

const MANIPULATION = ['instruction_override', 'targets_approval', 'authority_claim'] as const;
const OTHER_RECIPIENT = ['payee_change', 'other_destination'] as const;

/**
 * Decision table: turns Policy, Screen and Judge results into the final verdict. Pure, no money.
 * Screen and Judge are absent when Policy blocked (Jev is never called then). Order: BLOCK rules
 * first, then REVIEW rules, ALLOW only when nothing fired.
 */
export function decide(
  input: {
    policy: PolicyOutcome;
    amount: bigint;
    screen?: ScreenAnswers;
    judge?: JudgeAnswers;
  },
  thresholds: Thresholds = DEFAULT_THRESHOLDS,
): Decision {
  const { policy, amount, screen, judge } = input;
  const result = (verdict: Verdict, reason: VerdictReason, detail: string) => ({
    verdict,
    reason,
    detail,
  });
  const block = (reason: VerdictReason, detail: string) => result('BLOCK', reason, detail);
  const review = (reason: VerdictReason, detail: string) => result('REVIEW', reason, detail);

  if (!policy.ok) return block(policy.reason, `Policy: ${policy.detail}`);
  // Fail closed: without both semantic checks there is no ALLOW.
  if (!screen || !judge) return block('jev_unavailable', 'Jev did not answer');

  const flagged = (questions: readonly ScreenFlag[], threshold = thresholds.yes) =>
    questions.filter((q) => screen[q] >= threshold);
  const listed = (questions: ScreenFlag[]) =>
    questions.map((q) => `${q} ${screen[q].toFixed(2)}`).join(', ');

  // BLOCK
  const injection = flagged(MANIPULATION, thresholds.injection);
  if (injection.length > 0) return block('prompt_injection', `Screen flagged ${listed(injection)}`);
  if (judge.mandate_rules.choice === 'forbidden') {
    return block('off_intent', 'Judge: a forbidden rule of the intent applies');
  }
  if (judge.mandate_purpose.choice === 'outside_purpose') {
    return block('off_intent', 'Judge: outside the approved purpose');
  }
  if (judge.task_relation.choice === 'unrelated') {
    return block('off_intent', 'Judge: unrelated to the task');
  }

  // REVIEW
  const otherRecipient = flagged(OTHER_RECIPIENT);
  if (otherRecipient.length > 0) {
    return review('recipient_change', `Screen flagged ${listed(otherRecipient)}`);
  }
  const manipulation = flagged(MANIPULATION);
  if (manipulation.length > 0) {
    return review('suspicious_offer', `Screen flagged ${listed(manipulation)}`);
  }
  const billing = screen.billing_basis.choice;
  if (
    billing === 'recurring_subscription' ||
    billing === 'long_commitment' ||
    screen.offer_type.choice === 'subscription_access'
  ) {
    return review(
      'subscription',
      `Screen: billed as ${billing}, offer ${screen.offer_type.choice}`,
    );
  }
  if (screen.urgency >= thresholds.yes) return review('suspicious_offer', 'Screen flagged urgency');
  if (screen.purpose_consistency.choice === 'contradictory') {
    return review('suspicious_offer', 'Screen: the merchant texts contradict each other');
  }
  if (screen.deliverable_stated < thresholds.yes) {
    return review('suspicious_offer', 'Screen: the merchant does not say what you get');
  }
  if (judge.severity >= thresholds.severe) {
    return review('suspicious_offer', `Judge: severity ${judge.severity.toFixed(1)} of 3`);
  }
  if (judge.scope.choice === 'far_beyond_need') {
    return review('beyond_need', 'Judge: scope far beyond what the task needs');
  }
  if (judge.history_relation.choice === 'same_need_again') {
    return review('beyond_need', 'Judge: an earlier purchase already covers this need');
  }
  // Approving options add up: "needed" 0.41 + "supports" 0.50 is a clear yes.
  const unclear = (Object.keys(APPROVING) as (keyof typeof APPROVING)[])
    .map((q) => {
      const probabilities: Partial<Record<string, number>> = judge[q].probabilities;
      const support = APPROVING[q].reduce((sum, option) => sum + (probabilities[option] ?? 0), 0);
      return { q, support };
    })
    .filter(({ support }) => support < requiredSupport(amount, thresholds));
  if (unclear.length > 0) {
    const what = unclear.map(({ q, support }) => `${q} ${support.toFixed(2)}`);
    return review('unclear_fit', `Judge is not sure: ${what.join(', ')}`);
  }

  return result('ALLOW', 'within_intent', 'Policy, Screen and Judge passed');
}
