// Derives predictions from recorded Jev answers with given thresholds. Pure and fast: tuning and
// ablations call it thousands of times without touching Jev.
import type { Verdict } from '@semanticauth/contracts';
import { decide, requiredSupport, type Thresholds } from '../src/domain/decision/decide';
import type { JudgeAnswers } from '../src/domain/jev/judge-questions';
import type { ScreenAnswers } from '../src/domain/jev/screen-questions';
import type { CaseRecord } from './runner';

export const MANIPULATION = [
  'instruction_override',
  'targets_approval',
  'authority_claim',
] as const;
export const OTHER_RECIPIENT = ['payee_change', 'other_destination'] as const;

/** Which layers are switched on. `full-oracle` uses Judge on the person-written extraction. */
export const ABLATIONS = ['none', 'policy', 'policy+screen', 'full', 'full-oracle'] as const;
export type Ablation = (typeof ABLATIONS)[number];

/** Judge answers that never object: stands in for "Judge switched off". */
const c = (choice: string) => ({ choice, confidence: 1, probabilities: { [choice]: 1 } });
export const NEUTRAL_JUDGE = {
  mandate_purpose: c('within_purpose'),
  mandate_rules: c('no_rule_applies'),
  task_relation: c('needed'),
  history_relation: c('different_need'),
  scope: c('proportionate'),
  severity: 0,
} as JudgeAnswers;

/** Screen answers that trigger none of Screen's rules; the extraction stays for Judge. */
export const quietScreen = (s: ScreenAnswers): ScreenAnswers => ({
  ...s,
  instruction_override: 0,
  targets_approval: 0,
  authority_claim: 0,
  payee_change: 0,
  other_destination: 0,
  urgency: 0,
  deliverable_stated: 1,
  purpose_consistency: { choice: 'consistent', confidence: 1, probabilities: { consistent: 1 } },
  billing_basis: { choice: 'one_time_purchase', confidence: 1, probabilities: {} },
  offer_type: { choice: 'one_time_product', confidence: 1, probabilities: {} },
});

/** The records as if Jev were not there: whatever Policy lets through is paid. */
export const asPolicyOnly = (records: readonly CaseRecord[]): CaseRecord[] =>
  records.map((r) => ({
    ...r,
    error: undefined,
    screen: r.screen && quietScreen(r.screen),
    judge: r.judge && NEUTRAL_JUDGE,
    judgeOracle: r.judgeOracle && NEUTRAL_JUDGE,
  }));

/** Strongest manipulation signal, the score for ROC curves. */
export const manipulationScore = (screen: ScreenAnswers) =>
  Math.max(...MANIPULATION.map((q) => screen[q]));

export const recipientScore = (screen: ScreenAnswers) =>
  Math.max(...OTHER_RECIPIENT.map((q) => screen[q]));

/** Screen alone: what the decision table would do with this text's manipulation signals. */
export function predictScreen(screen: ScreenAnswers, t: Thresholds) {
  const score = manipulationScore(screen);
  return {
    injection: score >= t.injection ? 'block' : score >= t.yes ? 'review' : 'none',
    recipientChange: recipientScore(screen) >= t.yes,
  } as const;
}

/** Judge's verdict on fit, mirroring the decision table's Judge rules. */
export function predictRelation(
  judge: JudgeAnswers,
  amount: bigint,
  t: Thresholds,
): 'fits' | 'off_intent' | 'forbidden' | 'unclear' {
  if (judge.mandate_rules.choice === 'forbidden') return 'forbidden';
  if (judge.mandate_purpose.choice === 'outside_purpose') return 'off_intent';
  if (judge.task_relation.choice === 'unrelated') return 'off_intent';
  if (judge.topic_fit?.choice === 'different_subject' && t.rules?.topicMismatch === 'block') {
    return 'off_intent';
  }
  const support = (answer: { probabilities: Partial<Record<string, number>> }, options: string[]) =>
    options.reduce((sum, o) => sum + (answer.probabilities[o] ?? 0), 0);
  const required = requiredSupport(amount, t);
  const sure =
    support(judge.mandate_purpose, ['within_purpose']) >= required &&
    support(judge.mandate_rules, ['no_rule_applies', 'exception_applies']) >= required &&
    support(judge.task_relation, ['needed', 'supports']) >= required;
  return sure ? 'fits' : 'unclear';
}

/** The verdict a configuration would give for an e2e case. */
export function predictVerdict(record: CaseRecord, t: Thresholds, ablation: Ablation): Verdict {
  if (ablation === 'none') return 'ALLOW';
  const policy = record.policy ?? { ok: true as const };
  if (!policy.ok) return 'BLOCK';
  if (ablation === 'policy') return 'ALLOW';
  const amount = BigInt(record.amount ?? '0');
  const judge =
    ablation === 'policy+screen'
      ? NEUTRAL_JUDGE
      : ablation === 'full-oracle'
        ? record.judgeOracle
        : record.judge;
  return decide({ policy, amount, screen: record.screen, judge }, t).verdict;
}
