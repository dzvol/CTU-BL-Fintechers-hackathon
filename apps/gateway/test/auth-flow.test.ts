import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { cookiesFrom, createTestApp, login, testConfig } from './helpers';

describe('Google login flow', () => {
  it('logs in, exposes /api/me and logs out', async () => {
    const app = createTestApp();

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
      headers: { cookie: sessionCookie, origin: testConfig.webBaseUrl },
    });
    expect(out.status).toBe(204);

    const after = await app.request('/api/me', { headers: { cookie: sessionCookie } });
    expect(after.status).toBe(401);
  });

  it('rejects a callback whose state does not match the cookie', async () => {
    const app = createTestApp();
    const start = await app.request('/auth/google/login');
    const res = await app.request('/auth/google/callback?code=alice&state=forged', {
      headers: { cookie: cookiesFrom(start) },
    });
    expect(res.status).toBe(400);
  });

  it('rejects a cross-site logout (CSRF)', async () => {
    const app = createTestApp();
    const { sessionCookie } = await login(app);
    const res = await app.request('/auth/logout', {
      method: 'POST',
      headers: { cookie: sessionCookie, origin: 'https://evil.example' },
    });
    expect(res.status).toBe(403);
  });

  it('rejects /api/me without a session', async () => {
    const app = createTestApp();
    expect((await app.request('/api/me')).status).toBe(401);
  });

  it('answers 503 when Google is not configured', async () => {
    const app = createApp(testConfig);
    expect((await app.request('/auth/google/login')).status).toBe(503);
  });
});
