import {
  listResponseSchema,
  type Passkey,
  type PasskeyProof,
  type PasskeyRegistrationOptions,
  PasskeyRegistrationOptionsSchema,
  PasskeySchema,
  type StepUpAction,
  type StepUpChallenge,
  StepUpChallengeSchema,
} from '@semanticauth/contracts';
import {
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  startAuthentication,
  startRegistration,
  WebAuthnError,
} from '@simplewebauthn/browser';
import { z } from 'zod';
import { request } from './http';

export async function fetchPasskeys(): Promise<Passkey[]> {
  const { items } = await request('/api/passkeys', listResponseSchema(PasskeySchema));
  return items;
}

/** Step 1 of a confirmation: a one-time challenge plus what the user is about to confirm. */
export function requestStepUp(action: StepUpAction): Promise<StepUpChallenge> {
  return request('/api/step-up/challenge', StepUpChallengeSchema, {
    method: 'POST',
    body: { action },
  });
}

/**
 * Passkeys only work on the domain they are bound to. The browser's own error for a mismatch
 * (e.g. the dashboard opened on 127.0.0.1 instead of localhost) is cryptic, so say it plainly.
 */
function assertPasskeyDomain(rpId: unknown): void {
  const host = window.location.hostname;
  if (typeof rpId !== 'string' || host === rpId || host.endsWith(`.${rpId}`)) return;
  const url = `${window.location.protocol}//${rpId}${window.location.port ? `:${window.location.port}` : ''}`;
  throw new Error(`Passkeys work only on ${rpId}. Open the dashboard at ${url} and try again.`);
}

/**
 * Step 2: the OS passkey prompt signs the challenge. Call it first thing in a click handler;
 * Safari only allows WebAuthn directly from a user gesture.
 */
export async function signStepUp(challenge: StepUpChallenge): Promise<PasskeyProof> {
  // The options come from our gateway, which builds them with the WebAuthn library.
  const optionsJSON = challenge.options as unknown as PublicKeyCredentialRequestOptionsJSON;
  assertPasskeyDomain(optionsJSON.rpId);
  const assertion = await startAuthentication({ optionsJSON });
  return { challengeId: challenge.challengeId, assertion: { ...assertion } };
}

/** The first passkey needs a fresh Google login; another one needs a proof from an existing one. */
export function startPasskeyRegistration(
  proof?: PasskeyProof,
): Promise<PasskeyRegistrationOptions> {
  return request('/api/passkeys/registration/options', PasskeyRegistrationOptionsSchema, {
    method: 'POST',
    body: proof ? { proof } : {},
  });
}

/** Shows the OS prompt to create the passkey and stores it. Call it from a click handler. */
export async function finishPasskeyRegistration(
  registration: PasskeyRegistrationOptions,
  name: string,
): Promise<Passkey> {
  const optionsJSON = registration.options as unknown as PublicKeyCredentialCreationOptionsJSON;
  assertPasskeyDomain(optionsJSON.rp.id);
  const response = await startRegistration({ optionsJSON });
  return request('/api/passkeys/registration/verify', PasskeySchema, {
    method: 'POST',
    body: { registrationId: registration.registrationId, name, response },
  });
}

export async function removePasskey(id: string, proof: PasskeyProof): Promise<void> {
  await request(`/api/passkeys/${id}`, z.undefined(), { method: 'DELETE', body: { proof } });
}

/** SimpleWebAuthn's reason for a failed browser ceremony, e.g. ERROR_CEREMONY_ABORTED. */
export function webAuthnErrorCode(err: unknown): string | undefined {
  return err instanceof WebAuthnError ? err.code : undefined;
}

/** The user closed the passkey prompt; nothing happened. */
export function isPasskeyCancel(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'name' in err && err.name === 'NotAllowedError';
}
