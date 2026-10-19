import type { IntentProposal, PaidFetchResult } from '@semanticauth/contracts';
import { describe, expect, it, vi } from 'vitest';
import { c, fakeJev } from '../../../test/fake-jev';
import { createFakeMerchant, MERCHANT, SETTLEMENT_TX } from '../../../test/fake-merchant';
import { fakePayments } from '../../../test/fake-payments';
import { createStore, openDatabase } from '../../adapters/store';
import type { X402PaymentRequired } from '../../adapters/x402';
import { selectOffer as selectSupportedOffer } from '../payment-gateway/offer-selection';
import { defaultPolicy } from '../../domain/policy/policy';
import { createServices } from '..';
import type { AgentContext } from '../context';
import { APPROVAL_TTL_MS, REVIEW_TTL_MS } from './review-service';

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
const expectStatus = (status: number) => expect.objectContaining({ status });

function setup() {
  let t = new Date('2026-10-19T12:00:00Z');
  const advance = (ms: number) => (t = new Date(t.getTime() + ms));
  // The merchant's offer can change between the first request and the resumed one.
  const merchant = { amount: undefined as string | undefined };
  const selectOffer = vi.fn((paymentRequired: X402PaymentRequired, requestedUrl: string) => {
    const selected = selectSupportedOffer(paymentRequired, requestedUrl)!;
    if (merchant.amount) selected.offer.amount = merchant.amount;
    return selected;
  });
  const shop = createFakeMerchant();
  const policy = { allow: true };
  const services = createServices({
    store: createStore(openDatabase(':memory:')),
    transport: shop.transport,
    ...fakePayments(),
    // Every paid offer looks like a subscription → REVIEW.
    jev: fakeJev({ billing_basis: c('recurring_subscription', 0.9) }),
    policy: (input) =>
      policy.allow
        ? defaultPolicy(input)
        : { ok: false, reason: 'policy_limit_exceeded', detail: 'the task budget is used up' },
    selectOffer,
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
  const alice = agentOf('alice');
  const taskId = services.intents.approve(
    alice.userId,
    services.intents.submit(alice, proposal).intentId,
  ).taskId!;

  /** paid_fetch on the paid URL; returns the result and the review it opened. */
  const fetchPaid = async () => {
    const result = await services.payments.paidFetch(alice, { url: PAID });
    return { result, reviewId: result.reviewId! };
  };
  return {
    ...services,
    advance,
    merchant,
    policy,
    selectOffer,
    shop,
    alice,
    bob: agentOf('bob'),
    taskId,
    fetchPaid,
  };
}

const stateOf = (result: PaidFetchResult) => ({ state: result.state, message: result.message });

describe('ReviewService', () => {
  it('opens a pending review together with the awaiting operation', async () => {
    const { fetchPaid, reviews, alice } = setup();
    const { result, reviewId } = await fetchPaid();

    expect(result).toMatchObject({
      state: 'awaiting_review',
      verdict: 'REVIEW',
      reason: 'subscription',
      reviewId: expect.stringMatching(/^rev_/),
    });
    expect(reviews.listForUser(alice.userId, { status: 'pending' })).toEqual([
      expect.objectContaining({
        id: reviewId,
        operationId: result.operationId,
        status: 'pending',
        reason: 'subscription',
        url: PAID,
        detail: expect.stringContaining('recurring_subscription'),
        offer: expect.objectContaining({ amount: '10000' }),
        expiresAt: new Date(Date.parse('2026-10-19T12:00:00Z') + REVIEW_TTL_MS).toISOString(),
      }),
    ]);
  });

  it('tells the agent to wait while the review is pending', async () => {
    const { fetchPaid, reviews, payments, alice, selectOffer } = setup();
    const { result } = await fetchPaid();

    expect(reviews.checkForAgent(alice, result.operationId)).toMatchObject({
      status: 'pending',
      message: expect.stringContaining('Poll check_review'),
    });
    // Asking again doesn't fetch or decide anything new.
    const again = await payments.paidFetch(alice, { url: PAID });
    expect(again).toMatchObject({ operationId: result.operationId, state: 'awaiting_review' });
    expect(again.message).toContain('has not decided yet');
    expect(selectOffer).toHaveBeenCalledTimes(1);
  });

  it('closes the operation when the user rejects', async () => {
    const { fetchPaid, reviews, payments, alice } = setup();
    const { result, reviewId } = await fetchPaid();

    expect(reviews.reject(alice.userId, reviewId)).toMatchObject({ status: 'rejected' });
    expect(reviews.checkForAgent(alice, result.operationId)).toMatchObject({
      status: 'rejected',
      message: expect.stringContaining('do not buy it'),
    });
    expect(stateOf(await payments.paidFetch(alice, { url: PAID }))).toMatchObject({
      state: 'closed',
      message: expect.stringContaining('rejected this purchase'),
    });
    expect(() => reviews.approve(alice.userId, reviewId)).toThrow(expectStatus(409));
  });

  it('resumes an approved review with the same offer and goes on to pay', async () => {
    const { fetchPaid, reviews, payments, alice, selectOffer, shop } = setup();
    const { result, reviewId } = await fetchPaid();
    expect(shop.payments).toHaveLength(0);

    expect(reviews.approve(alice.userId, reviewId)).toMatchObject({
      status: 'approved',
      expiresAt: new Date(Date.parse('2026-10-19T12:00:00Z') + APPROVAL_TTL_MS).toISOString(),
    });
    expect(reviews.checkForAgent(alice, result.operationId).message).toContain('paid_fetch again');

    const resumed = await payments.paidFetch(alice, { url: PAID });
    expect(selectOffer).toHaveBeenCalledTimes(2);
    expect(resumed).toMatchObject({
      operationId: result.operationId,
      state: 'delivered',
      verdict: 'ALLOW',
      // Why the user was asked stays on the operation.
      reason: 'subscription',
      settlement: { txHash: SETTLEMENT_TX },
    });
    expect(shop.payments).toHaveLength(1);
    expect(reviews.checkForAgent(alice, result.operationId).message).toContain('already used');
  });

  it('does not pay when the offer changed after approval', async () => {
    const { fetchPaid, reviews, payments, alice, merchant } = setup();
    const { reviewId } = await fetchPaid();
    reviews.approve(alice.userId, reviewId);

    merchant.amount = '20000';
    expect(stateOf(await payments.paidFetch(alice, { url: PAID }))).toEqual({
      state: 'closed',
      message:
        'Closed after review: the offer changed since the user approved it. Nothing was paid.',
    });
  });

  it('re-checks Policy before paying an approved review', async () => {
    const { fetchPaid, reviews, payments, alice, policy } = setup();
    const { reviewId } = await fetchPaid();
    reviews.approve(alice.userId, reviewId);

    policy.allow = false;
    expect(await payments.paidFetch(alice, { url: PAID })).toMatchObject({
      state: 'closed',
      verdict: 'BLOCK',
      reason: 'policy_limit_exceeded',
      message: expect.stringContaining('task budget is used up'),
    });
  });

  it('resumes only once when the agent repeats the call concurrently', async () => {
    const { fetchPaid, reviews, payments, alice, shop } = setup();
    const { result, reviewId } = await fetchPaid();
    reviews.approve(alice.userId, reviewId);

    const results = await Promise.all([
      payments.paidFetch(alice, { url: PAID }),
      payments.paidFetch(alice, { url: PAID }),
    ]);
    // One call pays; the other reports the operation as it found it, mid-payment.
    expect(results.map((r) => r.operationId)).toEqual([result.operationId, result.operationId]);
    expect(results[0]!.state).toBe('delivered');
    expect(shop.payments).toHaveLength(1);
    expect(payments.getOperation(alice.userId, result.operationId).state).toBe('delivered');
  });

  it.each([
    ['pending review', false, REVIEW_TTL_MS, 'did not decide in time'],
    ['unused approval', true, APPROVAL_TTL_MS, 'approval was not used in time'],
  ])('expires a %s after 5 minutes', async (_name, approve, ttl, why) => {
    const { fetchPaid, reviews, payments, alice, advance } = setup();
    const { result, reviewId } = await fetchPaid();
    if (approve) reviews.approve(alice.userId, reviewId);

    advance(ttl - 1);
    expect(reviews.checkForAgent(alice, result.operationId).status).toBe(
      approve ? 'approved' : 'pending',
    );
    advance(1);
    expect(reviews.checkForAgent(alice, result.operationId).status).toBe('expired');
    expect(payments.getOperation(alice.userId, result.operationId)).toMatchObject({
      state: 'closed',
      message: expect.stringContaining(why),
    });
    expect(() => reviews.reject(alice.userId, reviewId)).toThrow(expectStatus(409));
  });

  it('expires the review when the task ends first', async () => {
    const { fetchPaid, reviews, tasks, payments, alice, taskId } = setup();
    const { result } = await fetchPaid();

    tasks.close(alice.userId, taskId);
    expect(reviews.listForUser(alice.userId, {})).toMatchObject([{ status: 'expired' }]);
    expect(payments.getOperation(alice.userId, result.operationId).message).toContain('task ended');
  });

  it("keeps users out of each other's reviews", async () => {
    const { fetchPaid, reviews, alice, bob } = setup();
    const { result, reviewId } = await fetchPaid();

    expect(reviews.listForUser(bob.userId, {})).toEqual([]);
    expect(() => reviews.approve(bob.userId, reviewId)).toThrow(expectStatus(403));
    expect(() => reviews.reject(bob.userId, reviewId)).toThrow(expectStatus(403));
    expect(() => reviews.checkForAgent(bob, result.operationId)).toThrow(expectStatus(403));
    expect(() => reviews.approve(alice.userId, 'rev_00000000-0000-0000-0000-000000000000')).toThrow(
      expectStatus(404),
    );
  });

  it('answers 404 for an operation that was never reviewed', async () => {
    const { reviews, payments, alice } = setup();
    const free = await payments.paidFetch(alice, { url: `${MERCHANT}/free` });
    expect(() => reviews.checkForAgent(alice, free.operationId)).toThrow(expectStatus(404));
  });
});
