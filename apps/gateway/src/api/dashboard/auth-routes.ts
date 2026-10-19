import { randomBytes } from 'node:crypto';
import { Hono } from 'hono';
import { deleteCookie, getCookie, getSignedCookie, setCookie, setSignedCookie } from 'hono/cookie';
import {
  createPkce,
  type GoogleOAuthClient,
} from '../../adapters/google-oauth/google-oauth-client';
import { SESSION_COOKIE } from '../../auth/request-context';
import type { SessionService } from '../../auth/session-service';
import type { AccountService } from '../../services/account/account-service';
import { apiError } from '../errors';

const OAUTH_COOKIE = 'sa_oauth';
const OAUTH_COOKIE_PATH = '/auth/google';

/** Mounted at /auth. Google OAuth login (authorization code + PKCE) and logout. */
export function createAuthRoutes(deps: {
  google: GoogleOAuthClient | undefined;
  accounts: AccountService;
  sessions: SessionService;
  sessionSecret: string;
  secureCookies: boolean;
}) {
  const app = new Hono();
  const cookieBase = { httpOnly: true, sameSite: 'Lax', secure: deps.secureCookies } as const;

  app.use('/google/*', async (c, next) => {
    if (!deps.google) {
      return apiError(c, 503, 'google_oauth_not_configured', 'Google login is not configured');
    }
    await next();
  });

  app.get('/google/login', async (c) => {
    const state = randomBytes(16).toString('base64url');
    const pkce = createPkce();
    // Both values are base64url, so '.' is a safe separator.
    await setSignedCookie(c, OAUTH_COOKIE, `${state}.${pkce.verifier}`, deps.sessionSecret, {
      ...cookieBase,
      path: OAUTH_COOKIE_PATH,
      maxAge: 600,
    });
    return c.redirect(deps.google!.authorizationUrl({ state, codeChallenge: pkce.challenge }));
  });

  app.get('/google/callback', async (c) => {
    const stored = await getSignedCookie(c, deps.sessionSecret, OAUTH_COOKIE);
    deleteCookie(c, OAUTH_COOKIE, { path: OAUTH_COOKIE_PATH });

    const [state, codeVerifier] = stored ? stored.split('.') : [];
    const code = c.req.query('code');
    if (!state || !codeVerifier || state !== c.req.query('state') || !code) {
      return apiError(c, 400, 'invalid_oauth_state', 'Login expired or was tampered with');
    }

    let identity;
    try {
      identity = await deps.google!.exchangeCode({ code, codeVerifier });
    } catch (err) {
      console.warn('Google login failed:', err instanceof Error ? err.message : err);
      return apiError(c, 401, 'google_login_failed', 'Google login failed');
    }

    const userId = deps.accounts.loginWithGoogle(identity);
    const session = deps.sessions.create(userId);
    setCookie(c, SESSION_COOKIE, session.token, {
      ...cookieBase,
      path: '/',
      expires: session.expiresAt,
    });
    return c.redirect('/');
  });

  app.post('/logout', (c) => {
    const token = getCookie(c, SESSION_COOKIE);
    if (token) deps.sessions.revoke(token);
    deleteCookie(c, SESSION_COOKIE, { path: '/' });
    return c.body(null, 204);
  });

  return app;
}
