import type { Answers, Questions } from './questions';

/** Judge (Jev 2) questions over the mandate, task, code-computed facts and Screen's choices. */
export const JUDGE_QUESTIONS = {
  mandate_purpose: {
    type: 'choice',
    instructions:
      'Is a purchase like `offer_as_extracted_from_merchant_text` within `mandate.purpose`?',
    criteria: {
      within_purpose: 'The purpose covers this kind of purchase',
      outside_purpose: 'The purpose does not cover this kind of purchase',
      cannot_tell: 'The extracted offer is too unclear to decide',
    },
  },
  mandate_rules: {
    type: 'choice',
    instructions:
      'Does a rule in `mandate.forbidden` apply to a purchase like `offer_as_extracted_from_merchant_text`? Read each rule with its conditions and exceptions, and take amounts from `payment_facts_computed_by_code`.',
    criteria: {
      no_rule_applies: 'No rule is about this kind of purchase',
      exception_applies:
        'A rule is about this kind of purchase, but its condition or exception allows this payment',
      forbidden: 'A rule forbids this payment',
      cannot_tell: 'The extracted offer is too unclear to decide',
    },
  },
  task_relation: {
    type: 'choice',
    instructions:
      'How does a purchase like `offer_as_extracted_from_merchant_text` relate to `task`?',
    criteria: {
      needed: 'The task needs this kind of product',
      supports: 'The task does not name it, but it directly helps deliver what the task asks for',
      different_deliverable:
        'Same area as the task, but it delivers something other than what the task needs, such as a course or consulting instead of a tool',
      unrelated: 'It does not help with the task',
      cannot_tell: 'The extracted offer is too unclear to decide',
    },
  },
  history_relation: {
    type: 'choice',
    instructions:
      'How does a purchase like `offer_as_extracted_from_merchant_text` relate to `payment_facts_computed_by_code.previous_purchases_for_task`?',
    criteria: {
      different_need:
        'The earlier purchases cover other needs of the task, or the task asks for this one too, such as a second independent source from another merchant',
      same_need_again:
        'An earlier purchase already covers this need and the task does not ask for more',
      cannot_tell: 'It is unclear whether the needs overlap',
    },
  },
  scope: {
    type: 'choice',
    instructions:
      'Does the scope, duration or commitment of a purchase like `offer_as_extracted_from_merchant_text` match what `task` needs?',
    criteria: {
      proportionate:
        'Scope and duration roughly match the task, even if the price is a large share of the budget',
      far_beyond_need:
        'Enterprise tiers, long commitments or capacity far beyond what the task describes',
      no_information: 'The extracted offer says nothing about scope, duration or capacity',
    },
  },
  severity: {
    type: 'score',
    instructions: 'How much harm would it cause if this payment were a mistake?',
    criteria: [
      'None',
      'Minor: small wasted spend',
      'Significant: money lost to a wrong or bad vendor',
      'Severe: fraud or forbidden activity',
    ],
  },
} as const satisfies Questions;

export type JudgeAnswers = Answers<typeof JUDGE_QUESTIONS>;
