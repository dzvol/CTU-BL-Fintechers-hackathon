import type { IntentProposal } from '@semanticauth/contracts';
import { describe, expect, it } from 'vitest';
import { fakeJev } from '../../../test/fake-jev';
import { fakeMerchantTransport } from '../../../test/fake-merchant';
import { fakePayments } from '../../../test/fake-payments';
import { createStore, openDatabase } from '../../adapters/store';
import { createServices } from '..';
import type { AgentContext } from '../context';
import { TASK_TTL_MS } from '../task/task-service';
import { INTENT_APPROVAL_TTL_MS } from './intent-service';

const proposal: IntentProposal = {
  purpose: 'Buy market data for a research note',
  task: "Get a snapshot of today's crypto market",
  allowedPurchases: ['market data APIs'],
  forbidden: ['trading or investments'],
  budgetUsdc: '1.00',
  maxPerPurchaseUsdc: '0.25',
  plannedPurchases: 4,
};

function setup() {
  let t = new Date('2026-10-19T12:00:00Z');
  const advance = (ms: number) => (t = new Date(t.getTime() + ms));
  const services = createServices({
    store: createStore(openDatabase(':memory:')),
    transport: fakeMerchantTransport(),
    jev: fakeJev(),
    ...fakePayments(),
    userAllocation: 2_000_000n,
    webBaseUrl: 'http://dashboard.test',
    now: () => t,
  });
  const agentOf = (googleSub: string): AgentContext => {
    const userId = services.accounts.loginWithGoogle({
      googleSub,
      email: `${googleSub}@example.com`,
    });
    return { userId, apiKeyId: services.apiKeys.create(userId, 'agent').apiKey.id };
  };
  return { ...services, advance, alice: agentOf('alice'), bob: agentOf('bob') };
}

const expectStatus = (status: number) => expect.objectContaining({ status });
const expectCode = (code: string) => expect.objectContaining({ code });

describe('IntentService + TaskService', () => {
  it('submits, approves and binds an active task to the submitting key', () => {
    const { intents, tasks, alice } = setup();

    const { intentId, status, approvalUrl } = intents.submit(alice, proposal);
    expect(status).toBe('pending_approval');
    expect(approvalUrl).toBe('http://dashboard.test');
    expect(tasks.getActiveTask(alice)).toBeNull();

    const approved = intents.approve(alice.userId, intentId);
    expect(approved).toMatchObject({ status: 'approved', budget: '1000000' });

    const task = tasks.getActiveTask(alice);
    expect(task).toMatchObject({
      id: approved.taskId,
      intentId,
      apiKeyId: alice.apiKeyId,
      status: 'active',
      budget: '1000000',
    });
    expect(intents.getStatus(alice, intentId)).toEqual({
      intentId,
      status: 'approved',
      taskId: task!.id,
      budget: '1000000',
    });
  });

  it('allows only one pending intent and one active task at a time', () => {
    const { intents, tasks, alice } = setup();
    const { intentId } = intents.submit(alice, proposal);

    expect(() => intents.submit(alice, proposal)).toThrow(expectCode('intent_pending'));

    const { taskId } = intents.approve(alice.userId, intentId);
    expect(() => intents.submit(alice, proposal)).toThrow(expectCode('active_task_exists'));

    tasks.close(alice.userId, taskId!);
    expect(intents.submit(alice, proposal).status).toBe('pending_approval');
  });

  it('rejects without creating a task, and decisions are final', () => {
    const { intents, tasks, alice } = setup();
    const { intentId } = intents.submit(alice, proposal);

    expect(intents.reject(alice.userId, intentId).status).toBe('rejected');
    expect(tasks.getActiveTask(alice)).toBeNull();
    expect(() => intents.approve(alice.userId, intentId)).toThrow(expectStatus(409));
  });

  it.each([
    ['zero budget', { budgetUsdc: '0' }],
    ['max per purchase above budget', { maxPerPurchaseUsdc: '1.50' }],
    ['budget above the allocation', { budgetUsdc: '3', maxPerPurchaseUsdc: '1' }],
  ])('rejects %s with 400', (_, change) => {
    const { intents, alice } = setup();
    expect(() => intents.submit(alice, { ...proposal, ...change })).toThrow(expectStatus(400));
  });

  it('expires an unanswered intent after the approval window', () => {
    const { intents, alice, advance } = setup();
    const { intentId } = intents.submit(alice, proposal);

    advance(INTENT_APPROVAL_TTL_MS);
    expect(intents.getStatus(alice, intentId).status).toBe('expired');
    expect(() => intents.approve(alice.userId, intentId)).toThrow(expectCode('intent_not_pending'));
    expect(intents.submit(alice, proposal).status).toBe('pending_approval');
  });

  it('expires an active task after its lifetime', () => {
    const { intents, tasks, alice, advance } = setup();
    const { taskId } = intents.approve(alice.userId, intents.submit(alice, proposal).intentId);

    advance(TASK_TTL_MS);
    expect(tasks.getActiveTask(alice)).toBeNull();
    expect(tasks.getForUser(alice.userId, taskId!).status).toBe('expired');
  });

  it("forbids touching another user's intent or task", () => {
    const { intents, tasks, alice, bob } = setup();
    const { intentId } = intents.submit(alice, proposal);

    expect(() => intents.getStatus(bob, intentId)).toThrow(expectStatus(403));
    expect(() => intents.approve(bob.userId, intentId)).toThrow(expectStatus(403));

    const { taskId } = intents.approve(alice.userId, intentId);
    expect(() => tasks.close(bob.userId, taskId!)).toThrow(expectStatus(403));
  });

  it('rotating the API key ends its task and its pending intent', () => {
    const { intents, tasks, apiKeys, alice } = setup();
    const { taskId } = intents.approve(alice.userId, intents.submit(alice, proposal).intentId);

    const { apiKey } = apiKeys.create(alice.userId, 'new key');
    expect(tasks.getForUser(alice.userId, taskId!).status).toBe('closed');

    const next = { userId: alice.userId, apiKeyId: apiKey.id };
    const { intentId } = intents.submit(next, proposal);
    apiKeys.revoke(alice.userId, next.apiKeyId);
    expect(intents.getForUser(alice.userId, intentId).status).toBe('expired');
  });
});
