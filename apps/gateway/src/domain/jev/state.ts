import type { Intent } from '@semanticauth/contracts';
import type { JudgeFacts } from '../facts/facts';
import type { JsonValue, PaymentRequiredQuery } from '../normalizer';
import type { ScreenAnswers } from './screen-questions';

/** Screen state: untrusted merchant text only. No mandate, task, amounts or recipient. */
export interface ScreenState {
  resource: { url: string; serviceName?: string; description?: string };
  response_body_excerpt?: JsonValue;
}

/** The offer as Screen extracted it: only our own option keys, never merchant wording. */
export interface ExtractedOffer {
  offer_type: ScreenAnswers['offer_type']['choice'];
  product_function: ScreenAnswers['product_function']['choice'];
  deliverable_kind: ScreenAnswers['deliverable_kind']['choice'];
  billing_basis: ScreenAnswers['billing_basis']['choice'];
  counterparty_type: ScreenAnswers['counterparty_type']['choice'];
  contains_personal_data: 'yes' | 'no';
  /** Only when the variant's Screen asks `subject_area`. */
  subject_area?: NonNullable<ScreenAnswers['subject_area']>['choice'];
}

/** Judge state. Built only from the approved intent, code-computed facts and Screen's choices. */
export interface JudgeState {
  mandate: { purpose: string; allowed_purchases: string[]; forbidden: string[] };
  task: string;
  payment_facts_computed_by_code: JudgeFacts;
  offer_as_extracted_from_merchant_text: ExtractedOffer;
}

/** A noul answer at or above this probability counts as "yes". */
export const YES = 0.5;

/** The resource and 402 body of a payment-required query (the same for every payment option). */
export function toScreenState(query: PaymentRequiredQuery): ScreenState {
  const fields = query.fields_to_inspect;
  return {
    resource: {
      url: fields.resourceUrl?.value ?? '',
      ...(query.serviceName !== undefined && { serviceName: query.serviceName }),
      ...(fields.resourceDescription && { description: fields.resourceDescription.value }),
    },
    ...(fields.additionalContent && { response_body_excerpt: fields.additionalContent.value }),
  };
}

export function toJudgeState(input: {
  intent: Intent;
  facts: JudgeFacts;
  screen: ScreenAnswers;
}): JudgeState {
  const { intent, facts, screen } = input;
  return {
    mandate: {
      purpose: intent.purpose,
      allowed_purchases: intent.allowedPurchases,
      forbidden: intent.forbidden,
    },
    task: intent.task,
    payment_facts_computed_by_code: facts,
    // Copy option keys one by one, so nothing else from Screen's answers can reach Judge.
    offer_as_extracted_from_merchant_text: {
      offer_type: screen.offer_type.choice,
      product_function: screen.product_function.choice,
      deliverable_kind: screen.deliverable_kind.choice,
      billing_basis: screen.billing_basis.choice,
      counterparty_type: screen.counterparty_type.choice,
      contains_personal_data: screen.contains_personal_data >= YES ? 'yes' : 'no',
      ...(screen.subject_area && { subject_area: screen.subject_area.choice }),
    },
  };
}
