import type { IntentProposal, PaymentNetwork } from '@semanticauth/contracts';
import { generatePrivateKey } from 'viem/accounts';
import { describe, expect, it } from 'vitest';
import { c, fakeJev } from '../../../test/fake-jev';
import {
  createFakeMerchant,
  INJECTION,
  MERCHANT,
  MERCHANT_PAY_TO,
  PAID_CONTENT,
  SETTLEMENT_TX,
} from '../../../test/fake-merchant';
import { fakeChainReader, fakePayments } from '../../../test/fake-payments';
import type { ChainReader } from '../../adapters/chain-reader';
import { createEoaSigner, PAYMENT_PROFILES } from '../../adapters/signer';
import { createStore, openDatabase, type OperationRecord } from '../../adapters/store';
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

function setup(
  options: {
    chainReader?: ChainReader;
    payments?: Partial<ReturnType<typeof fakePayments>> & { network?: PaymentNetwork };
    jev?: ReturnType<typeof fakeJev>;
  } = {},
) {
  const jev = options.jev ?? fakeJev();
  const store = createStore(openDatabase(':memory:'));
  // What the database held at the moment the payment header reached the merchant.
  const atPayment: { operation?: OperationRecord; payment?: unknown }[] = [];
  const merchant = createFakeMerchant({
    onPayment: () => {
      const operation = store.operations.listByUser(alice.userId, {})[0];
      atPayment.push({ operation, payment: store.payments.findByOperation(operation!.id) });
    },
  });
  const chainReader = options.chainReader ?? fakeChainReader();
  const services = createServices({
    store,
    transport: merchant.transport,
    userAllocation: 2_000_000n,
    webBaseUrl: 'http://dashboard.test',
    jev,
    ...fakePayments(chainReader),
    ...options.payments,
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
  const alice = agentOf('alice');
  return {
    ...services,
    store,
    jev,
    merchant,
    chainReader,
    atPayment,
    alice,
    bob: agentOf('bob'),
    startTask,
  };
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
    const { payments, alice, startTask, merchant } = setup();
    startTask(alice);

    const result = await payments.paidFetch(alice, { url: `${MERCHANT}/free` });
    expect(result).toMatchObject({
      state: 'delivered',
      verdict: 'ALLOW',
      reason: 'free_content',
      contentType: 'application/json',
    });
    expect(JSON.parse(result.content!)).toEqual({ headlines: ['BTC up 2%'] });
    expect(merchant.payments).toHaveLength(0);
  });

  it.each([
    ['broken-402', 'unsupported_offer'],
    ['paid-mainnet', 'unsupported_offer'],
    ['error', 'merchant_error'],
    ['down', 'merchant_error'],
  ])('blocks /%s with %s before asking Jev', async (path, reason) => {
    const { payments, alice, startTask, jev } = setup();
    startTask(alice);
    const result = await payments.paidFetch(alice, { url: `${MERCHANT}/${path}` });
    expect(result).toMatchObject({ state: 'blocked', reason });
    expect(jev.screen).not.toHaveBeenCalled();
  });

  it('refuses plain HTTP merchants', async () => {
    const { payments, alice, startTask } = setup();
    startTask(alice);
    const result = await payments.paidFetch(alice, { url: 'http://merchant.test/free' });
    expect(result).toMatchObject({ state: 'blocked', reason: 'merchant_error' });
    expect(result.message).toContain('unsupported_url');
  });

  it('never hands the 402 body (merchant text) to the agent', async () => {
    const { payments, alice, startTask } = setup({
      jev: fakeJev({ instruction_override: 0.95 }),
    });
    startTask(alice);
    const result = await payments.paidFetch(alice, { url: PAID });
    expect(result).toMatchObject({ state: 'blocked', reason: 'prompt_injection' });
    expect(JSON.stringify(result)).not.toContain(INJECTION);
  });

  it("forbids reading another user's operation", async () => {
    const { payments, alice, bob, startTask } = setup();
    startTask(alice);
    const { operationId } = await payments.paidFetch(alice, { url: PAID });

    expect(() => payments.getOperation(bob.userId, operationId)).toThrow(
      expect.objectContaining({ status: 403 }),
    );
    expect(payments.getOperation(alice.userId, operationId).state).toBe('delivered');
  });
});

describe('PaymentGateway payment execution', () => {
  it('pays an allowed offer, verifies it on chain and delivers the content', async () => {
    const { payments, tasks, store, alice, startTask, merchant, chainReader } = setup();
    const taskId = startTask(alice);

    const result = await payments.paidFetch(alice, { url: PAID });
    expect(result).toMatchObject({
      state: 'delivered',
      verdict: 'ALLOW',
      reason: 'within_intent',
      settlement: {
        txHash: SETTLEMENT_TX,
        explorerUrl: `https://sepolia.basescan.org/tx/${SETTLEMENT_TX}`,
      },
    });
    expect(JSON.parse(result.content!)).toEqual(PAID_CONTENT);
    expect(result.message).toContain(`Paid 0.01 USDC to ${MERCHANT_PAY_TO}`);

    expect(merchant.payments).toHaveLength(1);
    const payment = store.payments.findByOperation(result.operationId)!;
    expect(payment).toMatchObject({
      recipient: MERCHANT_PAY_TO,
      amount: 10_000n,
      txHash: SETTLEMENT_TX,
      paymentSignature: merchant.payments[0],
    });
    // ChainReader checks what the gateway signed, not what the merchant claims.
    expect(chainReader.verifyPayment).toHaveBeenCalledWith({
      txHash: SETTLEMENT_TX,
      chainId: 84532,
      token: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
      payer: payment.payer,
      recipient: MERCHANT_PAY_TO,
      amount: 10_000n,
      authorizationNonce: payment.nonce,
    });
    expect(store.ledger.findByOperation(result.operationId)?.state).toBe('spent');
    expect(tasks.getForUser(alice.userId, taskId)).toMatchObject({ spent: '10000', reserved: '0' });
  });

  it('persists the authorization as issued and spent before it leaves the gateway', async () => {
    const { payments, store, alice, startTask, atPayment, merchant } = setup();
    startTask(alice);
    const { operationId } = await payments.paidFetch(alice, { url: PAID });

    expect(atPayment).toHaveLength(1);
    expect(atPayment[0]!.operation?.state).toBe('issued');
    expect(atPayment[0]!.payment).toMatchObject({ paymentSignature: merchant.payments[0] });
    expect(store.ledger.findByOperation(operationId)?.state).toBe('spent');
  });

  it('never pays twice for a repeated request', async () => {
    const { payments, alice, startTask, merchant } = setup();
    startTask(alice);

    const first = await payments.paidFetch(alice, { url: PAID });
    const again = await payments.paidFetch(alice, { url: 'HTTPS://Merchant.Test/paid' });
    expect(again).toMatchObject({ operationId: first.operationId, state: 'delivered' });
    expect(again.message).toContain('already requested');
    expect(merchant.payments).toHaveLength(1);
  });

  it('counts the payment toward the next Policy check', async () => {
    const { payments, alice, startTask, jev } = setup();
    startTask(alice);
    await payments.paidFetch(alice, { url: PAID });
    await payments.paidFetch(alice, { url: `${PAID}?page=2` });

    const facts = jev.judge.mock.calls[1]![0].payment_facts_computed_by_code;
    expect(facts.previous_purchases_for_task).toBe(
      '1 purchase(s), 0.01 USDC in total, 1 of them to this recipient',
    );
  });

  it('blocks without paying when the sponsor pool cannot cover the reservation', async () => {
    const { payments, store, alice, startTask, merchant } = setup({
      payments: { poolLimit: 5_000n },
    });
    startTask(alice);

    const result = await payments.paidFetch(alice, { url: PAID });
    expect(result).toMatchObject({ state: 'blocked', reason: 'policy_limit_exceeded' });
    expect(result.message).toContain('sponsor pool');
    expect(store.ledger.findByOperation(result.operationId)).toBeUndefined();
    expect(merchant.payments).toHaveLength(0);
  });

  it('blocks without paying when no sponsor key is configured', async () => {
    const { payments, store, alice, startTask, merchant } = setup({
      payments: { signer: undefined },
    });
    startTask(alice);

    const result = await payments.paidFetch(alice, { url: PAID });
    expect(result).toMatchObject({ state: 'blocked', reason: 'internal_error' });
    expect(result.message).toContain('not configured');
    expect(store.ledger.findByOperation(result.operationId)).toBeUndefined();
    expect(merchant.payments).toHaveLength(0);
  });

  it('refuses to start when the Signer signs for another network', () => {
    expect(() => setup({ payments: { network: 'base-mainnet' } })).toThrow(
      'does not match payment network base-mainnet',
    );
  });

  it('on mainnet, blocks a Sepolia offer before Jev and pays nothing', async () => {
    const { payments, store, alice, startTask, merchant, jev } = setup({
      payments: {
        network: 'base-mainnet',
        signer: createEoaSigner(
          { network: 'base-mainnet' },
          { readPrivateKey: generatePrivateKey },
        ),
      },
    });
    startTask(alice);

    const result = await payments.paidFetch(alice, { url: PAID });
    expect(result).toMatchObject({ state: 'blocked', reason: 'unsupported_offer' });
    expect(result.message).toContain('exact/Base/USDC');
    expect(jev.screen).not.toHaveBeenCalled();
    expect(store.ledger.findByOperation(result.operationId)).toBeUndefined();
    expect(merchant.payments).toHaveLength(0);
  });

  it('releases the reservation when signing fails', async () => {
    const { payments, store, alice, startTask, merchant } = setup({
      payments: {
        signer: {
          address: '0x2222222222222222222222222222222222222222',
          profile: PAYMENT_PROFILES['base-sepolia'],
          signPayment: async () => ({ ok: false, reason: 'signing_failed' }),
        },
      },
    });
    startTask(alice);

    const result = await payments.paidFetch(alice, { url: PAID });
    expect(result).toMatchObject({ state: 'blocked', reason: 'internal_error' });
    expect(store.ledger.findByOperation(result.operationId)?.state).toBe('released');
    expect(merchant.payments).toHaveLength(0);
  });

  it('settled without content: delivery_failed, counted as spent', async () => {
    const { payments, store, alice, startTask } = setup();
    startTask(alice);

    const result = await payments.paidFetch(alice, { url: `${MERCHANT}/paid-empty` });
    expect(result).toMatchObject({
      state: 'delivery_failed',
      settlement: { txHash: SETTLEMENT_TX },
    });
    expect(result.content).toBeUndefined();
    expect(result.message).toContain('do not buy it again');
    expect(store.ledger.findByOperation(result.operationId)?.state).toBe('spent');
  });

  it('no settlement reported: unknown, counted as spent, content withheld', async () => {
    const { payments, store, alice, startTask, chainReader } = setup();
    startTask(alice);

    const result = await payments.paidFetch(alice, { url: `${MERCHANT}/paid-unconfirmed` });
    expect(result).toMatchObject({ state: 'unknown', verdict: 'ALLOW' });
    expect(result.content).toBeUndefined();
    expect(result.message).toContain('do not retry');
    expect(chainReader.verifyPayment).not.toHaveBeenCalled();
    expect(store.ledger.findByOperation(result.operationId)?.state).toBe('spent');
  });

  it('reads the chain again while the transaction is not visible, then gives up as unknown', async () => {
    const chainReader = fakeChainReader(() => ({
      status: 'unknown',
      reason: 'receipt_not_found',
    }));
    const { payments, store, alice, startTask } = setup({ chainReader });
    startTask(alice);

    const result = await payments.paidFetch(alice, { url: PAID });
    expect(result).toMatchObject({ state: 'unknown' });
    expect(result.settlement).toBeUndefined();
    expect(result.message).toContain(SETTLEMENT_TX);
    expect(chainReader.verifyPayment).toHaveBeenCalledTimes(3);
    expect(store.payments.findByOperation(result.operationId)?.txHash).toBe(SETTLEMENT_TX);
  });

  it('does not trust a transaction that does not match the authorization', async () => {
    const chainReader = fakeChainReader(() => ({ status: 'failed', reason: 'payment_mismatch' }));
    const { payments, alice, startTask } = setup({ chainReader });
    startTask(alice);

    const result = await payments.paidFetch(alice, { url: PAID });
    expect(result).toMatchObject({ state: 'unknown' });
    expect(result.message).toContain('payment_mismatch');
    expect(chainReader.verifyPayment).toHaveBeenCalledTimes(1);
  });

  it('a REVIEW reserves nothing and pays nothing', async () => {
    const { payments, store, alice, startTask, merchant } = setup({
      jev: fakeJev({ billing_basis: c('recurring_subscription', 0.9) }),
    });
    startTask(alice);

    const result = await payments.paidFetch(alice, { url: PAID });
    expect(result).toMatchObject({ state: 'awaiting_review', reason: 'subscription' });
    expect(store.ledger.findByOperation(result.operationId)).toBeUndefined();
    expect(merchant.payments).toHaveLength(0);
  });
});

describe('PaymentGateway.recoverInterrupted', () => {
  it('blocks what was not signed yet and keeps what may have been paid as spent', async () => {
    const { payments, store, alice, startTask } = setup();
    const taskId = startTask(alice);
    const at = '2026-10-19T12:00:00.000Z';
    const insert = (id: string, state: OperationRecord['state']) =>
      store.operations.insert({
        id,
        taskId,
        userId: alice.userId,
        url: `${PAID}?${id}`,
        state,
        verdict: null,
        reason: null,
        offer: null,
        settlement: null,
        message: null,
        createdAt: at,
        updatedAt: at,
      });
    const reserve = (operationId: string) =>
      store.ledger.reserve(
        { operationId, userId: alice.userId, taskId, amount: 10_000n, poolLimit: 1_000_000n, at },
        () => ({ ok: true }),
      );
    insert('op_reserved', 'reserved');
    reserve('op_reserved');
    insert('op_issued', 'issued');
    reserve('op_issued');
    store.ledger.markSpent('op_issued', at);
    insert('op_done', 'delivered');

    expect(payments.recoverInterrupted()).toBe(2);
    expect(payments.getOperation(alice.userId, 'op_reserved')).toMatchObject({
      state: 'blocked',
      reason: 'internal_error',
    });
    expect(store.ledger.findByOperation('op_reserved')?.state).toBe('released');
    expect(payments.getOperation(alice.userId, 'op_issued').state).toBe('unknown');
    expect(store.ledger.findByOperation('op_issued')?.state).toBe('spent');
    expect(payments.getOperation(alice.userId, 'op_done').state).toBe('delivered');
    expect(payments.recoverInterrupted()).toBe(0);
  });
});
