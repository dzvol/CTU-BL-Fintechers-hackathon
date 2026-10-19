import { z } from 'zod';

export const VerdictSchema = z.enum(['ALLOW', 'REVIEW', 'BLOCK']);
export type Verdict = z.infer<typeof VerdictSchema>;

/** Machine-readable reason attached to a verdict. Adding values is non-breaking. */
export const VerdictReasonSchema = z.enum([
  // BLOCK
  'unsupported_offer',
  'policy_limit_exceeded',
  'insufficient_allocation',
  'jev_unavailable',
  'prompt_injection',
  'off_intent',
  /** The merchant couldn't be reached or answered with an error; nothing was paid. */
  'merchant_error',
  /** A pipeline step failed or isn't implemented; fail-closed, nothing was paid. */
  'internal_error',
  // REVIEW
  'recipient_change',
  'subscription',
  'suspicious_offer',
  /** Judge is not sure the purchase fits the intent and task (low confidence or "cannot tell"). */
  'unclear_fit',
  /** More than the task needs: scope far beyond it, or a need an earlier purchase already covered. */
  'beyond_need',
  // ALLOW
  'within_intent',
  'free_content',
]);
export type VerdictReason = z.infer<typeof VerdictReasonSchema>;
