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
  /** A pipeline step failed or isn't implemented; fail-closed, nothing was paid. */
  'internal_error',
  // REVIEW
  'recipient_change',
  'subscription',
  'suspicious_offer',
  // ALLOW
  'within_intent',
  'free_content',
]);
export type VerdictReason = z.infer<typeof VerdictReasonSchema>;
