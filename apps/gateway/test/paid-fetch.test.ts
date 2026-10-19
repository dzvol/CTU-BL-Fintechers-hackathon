import type { IntentProposal } from '@semanticauth/contracts';
import { describe, expect, it } from 'vitest';
import { asUser, connectMcp, createAgentKey, createTestApp } from './helpers';

const proposal: IntentProposal = {
  purpose: 'Buy market data for a research note',
  task: "Get a snapshot of today's crypto market",
  allowedPurchases: ['market data APIs'],
  forbidden: ['trading or investments'],
  budgetUsdc: '1.00',
  maxPerPurchaseUsdc: '0.25',
  plannedPurchases: 4,
};

describe('paid_fetch over MCP + operations in the dashboard', () => {
  it('returns the operation as a normal result and lists it in the dashboard', async () => {
    const app = createTestApp();
    const { key, sessionCookie } = await createAgentKey(app);
    const agent = await connectMcp(app, key);

    const noTask = await agent.callTool({
      name: 'paid_fetch',
      arguments: { url: 'https://merchant.test/paid' },
    });
    expect(noTask.isError).toBe(true);
    expect(JSON.stringify(noTask.content)).toContain('no_active_task');

    const submitted = await agent.callTool({ name: 'submit_intent', arguments: proposal });
    const { intentId } = submitted.structuredContent as { intentId: string };
    await asUser(app, sessionCookie, `/api/intents/${intentId}/approve`, { method: 'POST' });

    const result = await agent.callTool({
      name: 'paid_fetch',
      arguments: { url: 'https://merchant.test/paid' },
    });
    expect(result.isError).toBeFalsy();
    const operation = result.structuredContent as { operationId: string; state: string };
    expect(operation).toMatchObject({ state: 'blocked', reason: 'internal_error' });

    const list = await asUser(app, sessionCookie, '/api/operations');
    expect(((await list.json()) as { items: unknown[] }).items).toMatchObject([
      { id: operation.operationId, state: 'blocked' },
    ]);
    const one = await asUser(app, sessionCookie, `/api/operations/${operation.operationId}`);
    expect(one.status).toBe(200);
    await agent.close();
  });
});
