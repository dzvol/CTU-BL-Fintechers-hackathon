import { describe, expect, it } from 'vitest';
import type { GoogleOAuthClient } from '../src/adapters/google-oauth/google-oauth-client';
import { createApp } from '../src/app';
import type { Config } from '../src/config';

const config: Config = {
  port: 0,
  webBaseUrl: 'http://localhost:5173',
  databasePath: ':memory:',
  google: undefined,
  sessionSecret: 'x'.repeat(64),
  secureCookies: false,
  userAllocation: 2_000_000n,
};

const fakeGoogle: GoogleOAuthClient = {
  authorizationUrl: ({ state }) => `https://google.test/auth?state=${state}`,
  exchangeCode: async () => ({ googleSub: 'google-1', email: 'alice@example.com', name: 'Alice' }),
};

/** name=value pairs from Set-Cookie, ready for a Cookie header. */
function cookiesFrom(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0])
    .join('; ');
}

async function login(app: ReturnType<typeof createApp>) {
  const start = await app.request('/auth/google/login');
  const state = new URL(start.headers.get('location')!).searchParams.get('state');
  const callback = await app.request(`/auth/google/callback?code=abc&state=${state}`, {
    headers: { cookie: cookiesFrom(start) },
  });
  return { start, callback, sessionCookie: cookiesFrom(callback) };
}

describe('Google login flow', () => {
  it('logs in, exposes /api/me and logs out', async () => {
    const app = createApp(config, { googleOAuth: fakeGoogle });

    const { start, callback, sessionCookie } = await login(app);
    expect(start.status).toBe(302);
    expect(callback.status).toBe(302);
    expect(callback.headers.get('location')).toBe('/');
    // The callback also clears the temporary OAuth cookie.
    expect(sessionCookie).toMatch(/(^|; )sa_oauth=;/);
    expect(sessionCookie).toMatch(/sa_session=[\w-]{43}/);

    const me = await app.request('/api/me', { headers: { cookie: sessionCookie } });
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({ email: 'alice@example.com', allocation: '2000000' });

    const out = await app.request('/auth/logout', {
      method: 'POST',
      headers: { cookie: sessionCookie, origin: config.webBaseUrl },
    });
    expect(out.status).toBe(204);

    const after = await app.request('/api/me', { headers: { cookie: sessionCookie } });
    expect(after.status).toBe(401);
  });

  it('rejects a callback whose state does not match the cookie', async () => {
    const app = createApp(config, { googleOAuth: fakeGoogle });
    const start = await app.request('/auth/google/login');
    const res = await app.request('/auth/google/callback?code=abc&state=forged', {
      headers: { cookie: cookiesFrom(start) },
    });
    expect(res.status).toBe(400);
  });

  it('rejects a cross-site logout (CSRF)', async () => {
    const app = createApp(config, { googleOAuth: fakeGoogle });
    const { sessionCookie } = await login(app);
    const res = await app.request('/auth/logout', {
      method: 'POST',
      headers: { cookie: sessionCookie, origin: 'https://evil.example' },
    });
    expect(res.status).toBe(403);
  });

  it('rejects /api/me without a session', async () => {
    const app = createApp(config, { googleOAuth: fakeGoogle });
    expect((await app.request('/api/me')).status).toBe(401);
  });

  it('answers 503 when Google is not configured', async () => {
    const app = createApp(config);
    expect((await app.request('/auth/google/login')).status).toBe(503);
  });
});
