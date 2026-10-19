import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { GoogleConfig } from '../../config';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

export interface GoogleIdentity {
  googleSub: string;
  email: string;
  name?: string;
  picture?: string;
}

export interface GoogleOAuthClient {
  authorizationUrl(params: { state: string; codeChallenge: string }): string;
  /** Exchanges the callback `code` for a verified identity. Throws on any failure. */
  exchangeCode(params: { code: string; codeVerifier: string }): Promise<GoogleIdentity>;
}

export function createPkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

const TokenResponseSchema = z.object({ id_token: z.string() });

const IdTokenClaimsSchema = z.object({
  iss: z.string(),
  aud: z.string(),
  sub: z.string().min(1),
  exp: z.number(),
  email: z.email(),
  email_verified: z.boolean(),
  name: z.string().optional(),
  picture: z.url().optional(),
});

/**
 * Validates the claims of an ID token received directly from Google's token endpoint.
 * The signature isn't checked: the token came over TLS from Google in exchange for our client
 * secret, which Google's OIDC docs accept as sufficient. Never use this for tokens from clients.
 */
export function parseIdToken(idToken: string, clientId: string, now: Date): GoogleIdentity {
  const payload = idToken.split('.')[1];
  if (!payload) throw new Error('Malformed ID token');
  const claims = IdTokenClaimsSchema.parse(
    JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')),
  );
  if (!ISSUERS.includes(claims.iss)) throw new Error('ID token has unexpected issuer');
  if (claims.aud !== clientId) throw new Error('ID token has unexpected audience');
  if (claims.exp * 1000 <= now.getTime()) throw new Error('ID token expired');
  if (!claims.email_verified) throw new Error('Google email is not verified');
  return {
    googleSub: claims.sub,
    email: claims.email,
    name: claims.name,
    picture: claims.picture,
  };
}

export function createGoogleOAuthClient(config: GoogleConfig): GoogleOAuthClient {
  return {
    authorizationUrl({ state, codeChallenge }) {
      const url = new URL(AUTH_URL);
      url.search = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        prompt: 'select_account',
      }).toString();
      return url.toString();
    },

    async exchangeCode({ code, codeVerifier }) {
      const res = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          code_verifier: codeVerifier,
          client_id: config.clientId,
          client_secret: config.clientSecret,
          redirect_uri: config.redirectUri,
          grant_type: 'authorization_code',
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`Google token exchange failed with HTTP ${res.status}`);
      const { id_token } = TokenResponseSchema.parse(await res.json());
      return parseIdToken(id_token, config.clientId, new Date());
    },
  };
}
