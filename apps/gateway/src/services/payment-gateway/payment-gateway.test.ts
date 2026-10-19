import type { IntentProposal } from '@semanticauth/contracts';
import { describe, expect, it } from 'vitest';
import { createStore, openDatabase } from '../../adapters/store';
import { createServices } from '..';
import type { AgentContext } from '../context';

const proposal: IntentProposal = {
  purpose: 'Buy market data for a research note',
  task: "Get a snapshot of today's crypto market",
  allowedPurchases: ['market data APIs'],
  forbidden: ['trading or investments'],
  budgetUsdc: '1.00',
  maxPerPurchaseUsdc: '0.25',
  plannedPurchases: 4,
};
const URL_A = 'https://merchant.example/data';

function setup() {
  const services = createServices({
    store: createStore(openDatabase(':memory:')),
    userAllocation: 2_000_000n,
    webBaseUrl: 'http://dashboard.test',
  });
  const agentOf = (googleSub: string): AgentContext => {
    const userId = services.accounts.loginWithGoogle({
      googleSub,
      email: `${googleSub}@example.com`,
    });
    return { userId, apiKeyId: services.apiKeys.create(userId, 'agent').apiKey.id };
  };
  /** Submits and approves an intent; returns the new task id. */
  const startTask = (agent: AgentContext) =>
    services.intents.approve(agent.userId, services.intents.submit(agent, proposal).intentId)
      .taskId!;
  return { ...services, alice: agentOf('alice'), bob: agentOf('bob'), startTask };
}

describe('PaymentGateway.paidFetch (skeleton)', () => {
  it('requires an active task', async () => {
    const { payments, alice } = setup();
    await expect(payments.paidFetch(alice, { url: URL_A })).rejects.toMatchObject({
      status: 409,
      code: 'no_active_task',
    });
  });

  it('records the operation and blocks fail-closed until the x402 transport exists', async () => {
    const { payments, alice, startTask } = setup();
    const taskId = startTask(alice);

    const result = await payments.paidFetch(alice, { url: URL_A });
    expect(result).toMatchObject({ state: 'blocked', verdict: 'BLOCK', reason: 'internal_error' });
    expect(result.message).toContain('x402 transport');
    expect(result.message).toContain('Nothing was paid');

    expect(payments.listOperations(alice.userId, { taskId })).toMatchObject([
      { id: result.operationId, url: URL_A, state: 'blocked' },
    ]);
  });

  it('is idempotent per task and URL', async () => {
    const { payments, alice, startTask } = setup();
    startTask(alice);

    const first = await payments.paidFetch(alice, { url: URL_A });
    const again = await payments.paidFetch(alice, { url: 'HTTPS://Merchant.Example/data' });
    expect(again.operationId).toBe(first.operationId);
    expect(again.message).toContain('already requested');

    const other = await payments.paidFetch(alice, { url: `${URL_A}?page=2` });
    expect(other.operationId).not.toBe(first.operationId);
    expect(payments.listOperations(alice.userId, {})).toHaveLength(2);
  });

  it('starts fresh in a new task', async () => {
    const { payments, tasks, alice, startTask } = setup();
    const firstTask = startTask(alice);
    const first = await payments.paidFetch(alice, { url: URL_A });

    tasks.close(alice.userId, firstTask);
    startTask(alice);
    const second = await payments.paidFetch(alice, { url: URL_A });
    expect(second.operationId).not.toBe(first.operationId);
  });

  it("forbids reading another user's operation", async () => {
    const { payments, alice, bob, startTask } = setup();
    startTask(alice);
    const { operationId } = await payments.paidFetch(alice, { url: URL_A });

    expect(() => payments.getOperation(bob.userId, operationId)).toThrow(
      expect.objectContaining({ status: 403 }),
    );
    expect(payments.getOperation(alice.userId, operationId).state).toBe('blocked');
  });
});
