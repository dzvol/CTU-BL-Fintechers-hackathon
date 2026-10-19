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

describe('intent → approval → task (MCP + dashboard)', () => {
  it('runs the whole flow', async () => {
    const app = createTestApp();
    const { key, sessionCookie } = await createAgentKey(app);
    const agent = await connectMcp(app, key);
    const call = async (name: string, args: Record<string, unknown> = {}) => {
      const result = await agent.callTool({ name, arguments: args });
      expect(result.isError, JSON.stringify(result.content)).toBeFalsy();
      return result.structuredContent as Record<string, any>;
    };

    // The template is a JSON Schema where every field is required.
    const { schema } = await call('get_intent_template');
    expect([...schema.required].sort()).toEqual(Object.keys(proposal).sort());
    expect(schema.additionalProperties).toBe(false);

    const { intentId, status } = await call('submit_intent', proposal);
    expect(status).toBe('pending_approval');

    const pending = await asUser(app, sessionCookie, '/api/intents?status=pending_approval');
    expect(((await pending.json()) as { items: unknown[] }).items).toMatchObject([
      { id: intentId, purpose: proposal.purpose },
    ]);

    const approve = await asUser(app, sessionCookie, `/api/intents/${intentId}/approve`, {
      method: 'POST',
    });
    expect(approve.status).toBe(200);

    const approved = await call('get_intent_status', { intentId });
    expect(approved).toMatchObject({ status: 'approved', budget: '1000000' });

    const { task } = await call('get_task');
    expect(task).toMatchObject({ id: approved.taskId, status: 'active' });

    const close = await asUser(app, sessionCookie, `/api/tasks/${task.id}/close`, {
      method: 'POST',
    });
    expect(close.status).toBe(200);
    expect((await call('get_task')).task).toBeNull();
    await agent.close();
  });

  it('rejects an incomplete or extended intent before it reaches the service', async () => {
    const app = createTestApp();
    const { key } = await createAgentKey(app);
    const agent = await connectMcp(app, key);

    const { plannedPurchases: _, ...missing } = proposal;
    for (const args of [missing, { ...proposal, extra: 'field' }]) {
      const result = await agent.callTool({ name: 'submit_intent', arguments: args });
      expect(result.isError).toBe(true);
    }
    await agent.close();
  });

  it('returns 409 to the agent while an intent is pending', async () => {
    const app = createTestApp();
    const { key } = await createAgentKey(app);
    const agent = await connectMcp(app, key);

    await agent.callTool({ name: 'submit_intent', arguments: proposal });
    const second = await agent.callTool({ name: 'submit_intent', arguments: proposal });
    expect(second.isError).toBe(true);
    expect(JSON.stringify(second.content)).toContain('intent_pending');
    await agent.close();
  });
});
