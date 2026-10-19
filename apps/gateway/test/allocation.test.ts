import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { IntentProposal, Me } from '@semanticauth/contracts';
import { describe, expect, it } from 'vitest';
import { createStore, openDatabase } from '../src/adapters/store';
import { createApp } from '../src/app';
import { fakeMerchantTransport } from './fake-merchant';
import { asUser, connectMcp, createAgentKey, fakeGoogle, testConfig } from './helpers';

const proposal: IntentProposal = {
  purpose: 'Buy market data for a research note',
  task: "Get a snapshot of today's crypto market",
  allowedPurchases: ['market data APIs'],
  forbidden: ['trading or investments'],
  budgetUsdc: '2.00',
  maxPerPurchaseUsdc: '0.25',
  plannedPurchases: 4,
};

/** The app on a database file, plus a second connection to it for setting up spending. */
function setup() {
  const databasePath = join(mkdtempSync(join(tmpdir(), 'semanticauth-')), 'test.db');
  const app = createApp(
    { ...testConfig, databasePath },
    { googleOAuth: fakeGoogle, x402Transport: fakeMerchantTransport() },
  );
  return { app, store: createStore(openDatabase(databasePath)) };
}

describe('sponsored allocation', () => {
  it('shows what is left and cuts the agent off once it is spent', async () => {
    const { app, store } = setup();
    const { key, sessionCookie } = await createAgentKey(app);
    const me = async () => (await (await asUser(app, sessionCookie, '/api/me')).json()) as Me;
    expect((await me()).balance).toEqual({ spent: '0', reserved: '0', remaining: '2000000' });

    const agent = await connectMcp(app, key);
    const { intentId } = (await agent.callTool({ name: 'submit_intent', arguments: proposal }))
      .structuredContent as { intentId: string };
    await agent.close();
    const approved = await asUser(app, sessionCookie, `/api/intents/${intentId}/approve`, {
      method: 'POST',
    });
    const { taskId } = (await approved.json()) as { taskId: string };

    // The task's purchases use up the whole allocation.
    const { userId } = store.tasks.findById(taskId)!;
    const at = new Date().toISOString();
    const entry = { userId, taskId, amount: 1_000_000n, poolLimit: 20_000_000n, at };
    store.ledger.reserve({ ...entry, operationId: 'op_a' }, () => ({ ok: true }));
    store.ledger.markSpent('op_a', at);
    store.ledger.reserve({ ...entry, operationId: 'op_b' }, () => ({ ok: true }));
    expect((await me()).balance).toEqual({
      spent: '1000000',
      reserved: '1000000',
      remaining: '0',
    });

    const refused = await app.request('/mcp', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    expect(refused.status).toBe(403);
    expect(await refused.json()).toMatchObject({ error: { code: 'allocation_exhausted' } });
    expect(
      (await app.request('/v1/whoami', { headers: { authorization: `Bearer ${key}` } })).status,
    ).toBe(403);

    const newKey = await asUser(app, sessionCookie, '/api/keys', {
      method: 'POST',
      body: JSON.stringify({ name: 'another' }),
    });
    expect(newKey.status).toBe(403);
    expect(await newKey.json()).toMatchObject({ error: { code: 'allocation_exhausted' } });

    // A payment that never settles is released: the money is back and so is the key.
    store.ledger.release('op_b', at);
    expect((await me()).balance?.remaining).toBe('1000000');
    expect(
      (await app.request('/v1/whoami', { headers: { authorization: `Bearer ${key}` } })).status,
    ).toBe(200);

    // Usage belongs to the user, not the key: a new key (or a new login) starts from what is left.
    const rotated = await createAgentKey(app);
    expect((await me()).balance).toEqual({ spent: '1000000', reserved: '0', remaining: '1000000' });
    expect(
      (await app.request('/v1/whoami', { headers: { authorization: `Bearer ${key}` } })).status,
    ).toBe(401);
    expect(
      (
        await app.request('/v1/whoami', {
          headers: { authorization: `Bearer ${rotated.key}` },
        })
      ).status,
    ).toBe(200);
  });
});
