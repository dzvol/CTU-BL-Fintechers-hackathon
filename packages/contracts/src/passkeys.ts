import { z } from 'zod';
import {
  AddressSchema,
  ChallengeIdSchema,
  IntentIdSchema,
  PasskeyIdSchema,
  ReviewIdSchema,
  TimestampSchema,
} from './ids';
import { AmountSchema } from './money';
import { VerdictReasonSchema } from './verdict';

/** A passkey that confirms approvals in the dashboard. Only its public key is stored. */
export const PasskeySchema = z.object({
  id: PasskeyIdSchema,
  name: z.string(),
  createdAt: TimestampSchema,
  lastUsedAt: TimestampSchema.optional(),
});
export type Passkey = z.infer<typeof PasskeySchema>;

/** What the user wants to confirm with a passkey. The gateway loads the facts itself. */
export const StepUpActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('approve_intent'), intentId: IntentIdSchema }),
  z.object({ type: z.literal('approve_review'), reviewId: ReviewIdSchema }),
  z.object({ type: z.literal('add_passkey') }),
  z.object({ type: z.literal('remove_passkey'), passkeyId: PasskeyIdSchema }),
]);
export type StepUpAction = z.infer<typeof StepUpActionSchema>;

/**
 * What the dashboard shows next to the passkey prompt, computed by the gateway from its own
 * records. The authenticator itself shows none of this.
 */
export const StepUpSummarySchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('approve_intent'),
    purpose: z.string(),
    budget: AmountSchema,
    maxPerPurchase: AmountSchema,
    plannedPurchases: z.number().int().positive(),
  }),
  z.object({
    type: z.literal('approve_review'),
    url: z.url(),
    amount: AmountSchema,
    payTo: AddressSchema,
    reason: VerdictReasonSchema,
  }),
  z.object({ type: z.literal('add_passkey') }),
  z.object({ type: z.literal('remove_passkey'), name: z.string() }),
]);
export type StepUpSummary = z.infer<typeof StepUpSummarySchema>;

/** POST /api/step-up/challenge body. */
export const StepUpChallengeInputSchema = z.object({ action: StepUpActionSchema });
export type StepUpChallengeInput = z.infer<typeof StepUpChallengeInputSchema>;

/** POST /api/step-up/challenge response: a one-time challenge bound to the action. */
export const StepUpChallengeSchema = z.object({
  challengeId: ChallengeIdSchema,
  expiresAt: TimestampSchema,
  summary: StepUpSummarySchema,
  /** PublicKeyCredentialRequestOptionsJSON, passed unchanged to startAuthentication(). */
  options: z.record(z.string(), z.unknown()),
});
export type StepUpChallenge = z.infer<typeof StepUpChallengeSchema>;

/** A signed step-up challenge. The assertion is checked by the WebAuthn library, not by Zod. */
export const PasskeyProofSchema = z.object({
  challengeId: ChallengeIdSchema,
  /** AuthenticationResponseJSON from startAuthentication(). */
  assertion: z.record(z.string(), z.unknown()),
});
export type PasskeyProof = z.infer<typeof PasskeyProofSchema>;

/**
 * Body of POST /api/intents/:id/approve and /api/reviews/:id/approve. The proof may be left out
 * only while the gateway doesn't require passkeys and the user has none.
 */
export const ApproveInputSchema = z.object({ proof: PasskeyProofSchema.optional() });
export type ApproveInput = z.infer<typeof ApproveInputSchema>;

/** POST /api/passkeys/registration/options body. A proof is needed once a passkey exists. */
export const PasskeyRegistrationOptionsInputSchema = z.object({
  proof: PasskeyProofSchema.optional(),
});
export type PasskeyRegistrationOptionsInput = z.infer<typeof PasskeyRegistrationOptionsInputSchema>;

export const PasskeyRegistrationOptionsSchema = z.object({
  registrationId: ChallengeIdSchema,
  /** PublicKeyCredentialCreationOptionsJSON, passed unchanged to startRegistration(). */
  options: z.record(z.string(), z.unknown()),
});
export type PasskeyRegistrationOptions = z.infer<typeof PasskeyRegistrationOptionsSchema>;

/** POST /api/passkeys/registration/verify body. */
export const PasskeyRegistrationInputSchema = z.object({
  registrationId: ChallengeIdSchema,
  name: z.string().trim().min(1).max(60),
  /** RegistrationResponseJSON from startRegistration(). */
  response: z.record(z.string(), z.unknown()),
});
export type PasskeyRegistrationInput = z.infer<typeof PasskeyRegistrationInputSchema>;

/** DELETE /api/passkeys/:id body. */
export const RemovePasskeyInputSchema = z.object({ proof: PasskeyProofSchema });
export type RemovePasskeyInput = z.infer<typeof RemovePasskeyInputSchema>;
