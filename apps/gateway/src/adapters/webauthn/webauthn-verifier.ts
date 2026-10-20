import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { z } from 'zod';

export interface WebAuthnConfig {
  /** Domain the passkeys are bound to, e.g. "localhost". Must never change once used. */
  rpId: string;
  rpName: string;
  /** Origin of the dashboard as the browser sees it, e.g. "http://localhost:5173". */
  origin: string;
}

export interface CredentialRef {
  /** base64url */
  id: string;
  transports: string[];
}

export interface StoredCredential extends CredentialRef {
  /** base64url COSE key */
  publicKey: string;
  counter: number;
}

/**
 * WebAuthn ceremonies. Verification never throws: anything wrong (bad signature, origin, RP ID,
 * missing user verification, malformed response) comes back as `undefined`, so callers fail
 * closed.
 */
export interface WebAuthnVerifier {
  registrationOptions(input: {
    /** Opaque, stable per user; never shown. */
    userHandle: string;
    userName: string;
    challenge: string;
    exclude: CredentialRef[];
  }): Promise<Record<string, unknown>>;
  verifyRegistration(input: {
    response: unknown;
    expectedChallenge: string;
  }): Promise<StoredCredential | undefined>;
  authenticationOptions(input: {
    challenge: string;
    allow: CredentialRef[];
  }): Promise<Record<string, unknown>>;
  verifyAuthentication(input: {
    response: unknown;
    expectedChallenge: string;
    credential: StoredCredential;
  }): Promise<{ newCounter: number } | undefined>;
}

// Only the outer shape; the library checks everything cryptographic.
const ResponseShape = z.looseObject({
  id: z.string().min(1),
  rawId: z.string().min(1),
  type: z.literal('public-key'),
  response: z.looseObject({ clientDataJSON: z.string().min(1) }),
  clientExtensionResults: z.record(z.string(), z.unknown()),
});

const bytes = (base64url: string) => new Uint8Array(Buffer.from(base64url, 'base64url'));
/** Options go to the browser as plain JSON. */
const asJson = (options: object): Record<string, unknown> => ({ ...options });

export function createSimpleWebAuthnVerifier(config: WebAuthnConfig): WebAuthnVerifier {
  const failed = (step: string, err: unknown) => {
    // No response contents in logs: only why it failed.
    console.warn(`WebAuthn ${step} failed:`, err instanceof Error ? err.message : err);
    return undefined;
  };

  return {
    async registrationOptions({ userHandle, userName, challenge, exclude }) {
      const options = await generateRegistrationOptions({
        rpName: config.rpName,
        rpID: config.rpId,
        userName,
        userID: new TextEncoder().encode(userHandle),
        challenge: bytes(challenge),
        attestationType: 'none',
        excludeCredentials: exclude,
        authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
      });
      return asJson(options);
    },

    async verifyRegistration({ response, expectedChallenge }) {
      const shape = ResponseShape.safeParse(response);
      if (!shape.success) return failed('registration', 'malformed response');
      try {
        const result = await verifyRegistrationResponse({
          response: shape.data as unknown as RegistrationResponseJSON,
          expectedChallenge,
          expectedOrigin: config.origin,
          expectedRPID: config.rpId,
          requireUserVerification: true,
        });
        if (!result.verified) return failed('registration', 'not verified');
        const { credential } = result.registrationInfo;
        return {
          id: credential.id,
          publicKey: Buffer.from(credential.publicKey).toString('base64url'),
          counter: credential.counter,
          transports: credential.transports ?? [],
        };
      } catch (err) {
        return failed('registration', err);
      }
    },

    async authenticationOptions({ challenge, allow }) {
      const options = await generateAuthenticationOptions({
        rpID: config.rpId,
        challenge: bytes(challenge),
        allowCredentials: allow,
        userVerification: 'required',
      });
      return asJson(options);
    },

    async verifyAuthentication({ response, expectedChallenge, credential }) {
      const shape = ResponseShape.safeParse(response);
      if (!shape.success) return failed('authentication', 'malformed response');
      try {
        const result = await verifyAuthenticationResponse({
          response: shape.data as unknown as AuthenticationResponseJSON,
          expectedChallenge,
          expectedOrigin: config.origin,
          expectedRPID: config.rpId,
          credential: {
            id: credential.id,
            publicKey: bytes(credential.publicKey),
            counter: credential.counter,
            transports: credential.transports,
          },
          requireUserVerification: true,
        });
        if (!result.verified) return failed('authentication', 'not verified');
        return { newCounter: result.authenticationInfo.newCounter };
      } catch (err) {
        return failed('authentication', err);
      }
    },
  };
}

/** Used when nothing is wired: every passkey check fails (fail closed). */
export function createRejectingWebAuthnVerifier(): WebAuthnVerifier {
  return {
    registrationOptions: async () => ({}),
    verifyRegistration: async () => undefined,
    authenticationOptions: async () => ({}),
    verifyAuthentication: async () => undefined,
  };
}
