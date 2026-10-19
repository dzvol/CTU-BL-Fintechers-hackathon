import { describe, expect, it } from 'vitest';
import { asUser, createAgentKey, createTestApp, login } from './helpers';

const whoami = (app: ReturnType<typeof createTestApp>, key?: string) =>
  app.request('/v1/whoami', key ? { headers: { authorization: `Bearer ${key}` } } : {});

describe('API keys (dashboard) and agent auth', () => {
  it('creates a key that authenticates the agent, lists it without the secret, revokes it', async () => {
    const app = createTestApp();
    const { key, apiKeyId, sessionCookie } = await createAgentKey(app);

    const me = await whoami(app, key);
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({ apiKeyId, email: 'alice@example.com' });

    const list = await asUser(app, sessionCookie, '/api/keys');
    const { items } = (await list.json()) as { items: { id: string }[] };
    expect(items.map((k) => k.id)).toEqual([apiKeyId]);
    expect(JSON.stringify(items)).not.toContain(key);

    const revoked = await asUser(app, sessionCookie, `/api/keys/${apiKeyId}`, {
      method: 'DELETE',
    });
    expect(revoked.status).toBe(200);
    expect((await whoami(app, key)).status).toBe(401);
  });

  it('rejects requests without a valid key', async () => {
    const app = createTestApp();
    expect((await whoami(app)).status).toBe(401);
    expect((await whoami(app, 'sa_not-a-real-key')).status).toBe(401);
  });

  it("forbids revoking another user's key", async () => {
    const app = createTestApp();
    const { apiKeyId } = await createAgentKey(app, 'alice');
    const { sessionCookie: bob } = await login(app, 'bob');

    const res = await asUser(app, bob, `/api/keys/${apiKeyId}`, { method: 'DELETE' });
    expect(res.status).toBe(403);
  });

  it('validates input', async () => {
    const app = createTestApp();
    const { sessionCookie } = await login(app);

    const noName = await asUser(app, sessionCookie, '/api/keys', {
      method: 'POST',
      body: JSON.stringify({ name: '' }),
    });
    expect(noName.status).toBe(400);
    expect(
      (await asUser(app, sessionCookie, '/api/keys/garbage', { method: 'DELETE' })).status,
    ).toBe(400);
  });

  it('does not accept an agent key on the dashboard API', async () => {
    const app = createTestApp();
    const { key } = await createAgentKey(app);
    const res = await app.request('/api/keys', { headers: { authorization: `Bearer ${key}` } });
    expect(res.status).toBe(401);
  });
});

describe('not yet implemented services', () => {
  it.each([['GET', '/api/reviews']])('%s %s answers 501 not_implemented', async (method, path) => {
    const app = createTestApp();
    const { sessionCookie } = await login(app);
    const res = await asUser(app, sessionCookie, path, { method });
    expect(res.status).toBe(501);
    expect(await res.json()).toMatchObject({ error: { code: 'not_implemented' } });
  });
});
