import { z } from 'zod';
import type { WebAuthnVerifier } from '../src/adapters/webauthn/webauthn-verifier';

/**
 * A fake authenticator and verifier. The options carry the challenge in the clear; a response
 * is valid when it echoes the challenge it was made for (and, for sign-in, `valid: true`).
 */
export function fakeWebAuthn(): WebAuthnVerifier {
  const Response = z.object({
    id: z.string(),
    challenge: z.string(),
    valid: z.boolean().optional(),
  });

  return {
    registrationOptions: async ({ challenge, exclude }) => ({
      challenge,
      excludeCredentials: exclude,
    }),
    verifyRegistration: async ({ response, expectedChallenge }) => {
      const parsed = Response.safeParse(response);
      if (!parsed.success || parsed.data.challenge !== expectedChallenge) return undefined;
      return { id: parsed.data.id, publicKey: `pub-${parsed.data.id}`, counter: 0, transports: [] };
    },
    authenticationOptions: async ({ challenge, allow }) => ({ challenge, allowCredentials: allow }),
    verifyAuthentication: async ({ response, expectedChallenge, credential }) => {
      const parsed = Response.safeParse(response);
      if (!parsed.success) return undefined;
      const { id, challenge, valid } = parsed.data;
      if (id !== credential.id || challenge !== expectedChallenge || !valid) return undefined;
      return { newCounter: credential.counter + 1 };
    },
  };
}

const challengeOf = (options: Record<string, unknown>) => z.string().parse(options.challenge);

/** What the browser sends back from startRegistration() for this fake. */
export const fakeRegistration = (credentialId: string, options: Record<string, unknown>) => ({
  id: credentialId,
  challenge: challengeOf(options),
});

/** What the browser sends back from startAuthentication() for this fake. */
export const fakeAssertion = (
  credentialId: string,
  options: Record<string, unknown>,
  valid = true,
) => ({ id: credentialId, challenge: challengeOf(options), valid });
