import { vi } from 'vitest';
import type { JevClient } from '../src/adapters/jev/jev-client';
import type { JudgeAnswers } from '../src/domain/jev/judge-questions';
import type { ScreenAnswers } from '../src/domain/jev/screen-questions';

/** A choice answer whose top option has probability `p`. */
export const c = <Option extends string>(choice: Option, p: number) => ({
  choice,
  confidence: p,
  probabilities: { [choice]: p } as Partial<Record<Option, number>>,
});

/** What Jev answers for an honest one-off market data purchase. */
export const HONEST_SCREEN: ScreenAnswers = {
  offer_type: c('one_time_product', 0.9),
  product_function: c('payments_finance', 0.85),
  deliverable_kind: c('data_delivery', 0.9),
  billing_basis: c('one_time_purchase', 0.9),
  counterparty_type: c('company', 0.8),
  contains_personal_data: 0.02,
  deliverable_stated: 0.95,
  targets_approval: 0.01,
  authority_claim: 0.01,
  payee_change: 0.01,
  urgency: 0.02,
  instruction_override: 0.01,
  other_destination: 0.02,
  purpose_consistency: c('consistent', 0.9),
  data_subject: c('markets_assets', 0.9),
  region: c('not_regional', 0.9),
};

export const HONEST_JUDGE: JudgeAnswers = {
  mandate_purpose: c('within_purpose', 0.95),
  mandate_rules: c('no_rule_applies', 0.9),
  task_relation: c('needed', 0.9),
  history_relation: c('different_need', 0.8),
  scope: c('proportionate', 0.85),
  severity: 0.6,
};

/** A Jev that answers like for an honest offer, except for the given answers. */
export function fakeJev(screen: Partial<ScreenAnswers> = {}, judge: Partial<JudgeAnswers> = {}) {
  return {
    screen: vi.fn<JevClient['screen']>(async () => ({ ...HONEST_SCREEN, ...screen })),
    judge: vi.fn<JevClient['judge']>(async () => ({ ...HONEST_JUDGE, ...judge })),
  };
}
