import { describe, expect, it, vi } from 'vitest';
import { createSimpleWebAuthnVerifier } from './webauthn-verifier';

const verifier = createSimpleWebAuthnVerifier({
  rpId: 'localhost',
  rpName: 'SemanticAuth',
  origin: 'http://localhost:5173',
});
// base64url of 32 bytes, like the gateway's challenges.
const challenge = Buffer.alloc(32, 7).toString('base64url');

describe('SimpleWebAuthn verifier', () => {
  it('puts the gateway challenge into the options unchanged', async () => {
    const auth = await verifier.authenticationOptions({
      challenge,
      allow: [{ id: 'Y3JlZA', transports: ['internal'] }],
    });
    expect(auth).toMatchObject({
      challenge,
      rpId: 'localhost',
      userVerification: 'required',
      allowCredentials: [{ id: 'Y3JlZA', type: 'public-key', transports: ['internal'] }],
    });

    const reg = await verifier.registrationOptions({
      userHandle: 'usr_1',
      userName: 'alice@example.com',
      challenge,
      exclude: [],
    });
    expect(reg).toMatchObject({
      challenge,
      rp: { id: 'localhost', name: 'SemanticAuth' },
      user: { name: 'alice@example.com' },
      authenticatorSelection: { userVerification: 'required' },
    });
  });

  it('fails closed on malformed or forged responses instead of throwing', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const credential = { id: 'Y3JlZA', publicKey: 'AAAA', counter: 0, transports: [] };
    const forged = {
      id: 'Y3JlZA',
      rawId: 'Y3JlZA',
      type: 'public-key',
      clientExtensionResults: {},
      response: {
        clientDataJSON: Buffer.from(
          JSON.stringify({ type: 'webauthn.get', challenge, origin: 'http://localhost:5173' }),
        ).toString('base64url'),
        authenticatorData: 'AAAA',
        signature: 'AAAA',
      },
    };

    for (const response of [undefined, {}, { id: 'x' }, forged]) {
      await expect(
        verifier.verifyAuthentication({ response, expectedChallenge: challenge, credential }),
      ).resolves.toBeUndefined();
      await expect(
        verifier.verifyRegistration({ response, expectedChallenge: challenge }),
      ).resolves.toBeUndefined();
    }
  });
});
