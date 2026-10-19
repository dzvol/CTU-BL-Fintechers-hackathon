import type { IntentProposal } from '@semanticauth/contracts';
import { describe, expect, it, vi } from 'vitest';
import { fakeMerchantTransport, INJECTION, MERCHANT } from '../../../test/fake-merchant';
import type { JevClient } from '../../adapters/jev/jev-client';
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
const PAID = `${MERCHANT}/paid`;

function setup() {
  const jev: JevClient = {
    screen: vi.fn(async () => ({ signals: [] })),
    judge: vi.fn(async () => ({ fitsIntent: true })),
  };
  const services = createServices({
    store: createStore(openDatabase(':memory:')),
    transport: fakeMerchantTransport(),
    userAllocation: 2_000_000n,
    webBaseUrl: 'http://dashboard.test',
    jev,
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
  return { ...services, jev, alice: agentOf('alice'), bob: agentOf('bob'), startTask };
}

describe('PaymentGateway.paidFetch', () => {
  it('requires an active task', async () => {
    const { payments, alice } = setup();
    await expect(payments.paidFetch(alice, { url: PAID })).rejects.toMatchObject({
      status: 409,
      code: 'no_active_task',
    });
  });

  it('delivers free content without payment', async () => {
    const { payments, alice, startTask } = setup();
    startTask(alice);

    const result = await payments.paidFetch(alice, { url: `${MERCHANT}/free` });
    expect(result).toMatchObject({
      state: 'delivered',
      verdict: 'ALLOW',
      reason: 'free_content',
      contentType: 'application/json',
    });
    expect(JSON.parse(result.content!)).toEqual({ headlines: ['BTC up 2%'] });
  });

  it('reads a 402 offer, then blocks fail-closed until offer selection exists', async () => {
    const { payments, alice, startTask, jev } = setup();
    const taskId = startTask(alice);

    const result = await payments.paidFetch(alice, { url: PAID });
    expect(result).toMatchObject({ state: 'blocked', verdict: 'BLOCK', reason: 'internal_error' });
    expect(result.message).toContain('Offer selection');
    expect(result.message).toContain('Nothing was paid');
    // Without a NormalizedOffer there is nothing to evaluate yet.
    expect(jev.screen).not.toHaveBeenCalled();
    expect(result.content).toBeUndefined();

    expect(payments.listOperations(alice.userId, { taskId })).toMatchObject([
      { id: result.operationId, url: PAID, state: 'blocked' },
    ]);
  });

  it.each([
    ['broken-402', 'unsupported_offer'],
    ['error', 'merchant_error'],
    ['down', 'merchant_error'],
  ])('blocks /%s with %s', async (path, reason) => {
    const { payments, alice, startTask } = setup();
    startTask(alice);
    const result = await payments.paidFetch(alice, { url: `${MERCHANT}/${path}` });
    expect(result).toMatchObject({ state: 'blocked', reason });
  });

  it('refuses plain HTTP merchants', async () => {
    const { payments, alice, startTask } = setup();
    startTask(alice);
    const result = await payments.paidFetch(alice, { url: 'http://merchant.test/free' });
    expect(result).toMatchObject({ state: 'blocked', reason: 'merchant_error' });
    expect(result.message).toContain('unsupported_url');
  });

  it('never hands the 402 body (merchant text) to the agent', async () => {
    const { payments, alice, startTask } = setup();
    startTask(alice);
    const result = await payments.paidFetch(alice, { url: PAID });
    expect(JSON.stringify(result)).not.toContain(INJECTION);
  });

  it('is idempotent per task and URL', async () => {
    const { payments, alice, startTask } = setup();
    startTask(alice);

    const first = await payments.paidFetch(alice, { url: PAID });
    const again = await payments.paidFetch(alice, { url: 'HTTPS://Merchant.Test/paid' });
    expect(again.operationId).toBe(first.operationId);
    expect(again.message).toContain('already requested');

    const other = await payments.paidFetch(alice, { url: `${PAID}?page=2` });
    expect(other.operationId).not.toBe(first.operationId);
    expect(payments.listOperations(alice.userId, {})).toHaveLength(2);
  });

  it('starts fresh in a new task', async () => {
    const { payments, tasks, alice, startTask } = setup();
    const firstTask = startTask(alice);
    const first = await payments.paidFetch(alice, { url: PAID });

    tasks.close(alice.userId, firstTask);
    startTask(alice);
    const second = await payments.paidFetch(alice, { url: PAID });
    expect(second.operationId).not.toBe(first.operationId);
  });

  it("forbids reading another user's operation", async () => {
    const { payments, alice, bob, startTask } = setup();
    startTask(alice);
    const { operationId } = await payments.paidFetch(alice, { url: PAID });

    expect(() => payments.getOperation(bob.userId, operationId)).toThrow(
      expect.objectContaining({ status: 403 }),
    );
    expect(payments.getOperation(alice.userId, operationId).state).toBe('blocked');
  });
});
