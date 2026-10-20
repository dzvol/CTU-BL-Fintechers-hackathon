import type { IntentProposal, PasskeyProof, StepUpAction } from '@semanticauth/contracts';
import { describe, expect, it } from 'vitest';
import { c, fakeJev } from '../../../test/fake-jev';
import { createFakeMerchant, MERCHANT } from '../../../test/fake-merchant';
import { fakePayments } from '../../../test/fake-payments';
import { fakeAssertion, fakeRegistration, fakeWebAuthn } from '../../../test/fake-webauthn';
import { createStore, openDatabase } from '../../adapters/store';
import { createRejectingWebAuthnVerifier } from '../../adapters/webauthn/webauthn-verifier';
import { createServices } from '..';
import type { AgentContext, UserContext } from '../context';
import { FRESH_LOGIN_MS, REGISTRATION_TTL_MS, STEP_UP_TTL_MS } from './passkey-service';

const proposal: IntentProposal = {
  purpose: 'Buy market data for a research note',
  task: "Get a snapshot of today's crypto market",
  allowedPurchases: ['market data APIs'],
  forbidden: ['trading or investments'],
  budgetUsdc: '1.00',
  maxPerPurchaseUsdc: '0.25',
  plannedPurchases: 4,
};

function setup(options: { required?: boolean; rejectingVerifier?: boolean } = {}) {
  let t = new Date('2026-10-20T12:00:00Z');
  const advance = (ms: number) => (t = new Date(t.getTime() + ms));
  const store = createStore(openDatabase(':memory:'));
  const services = createServices({
    store,
    transport: createFakeMerchant().transport,
    ...fakePayments(),
    // Every paid offer looks like a subscription → REVIEW.
    jev: fakeJev({ billing_basis: c('recurring_subscription', 0.9) }),
    userAllocation: 2_000_000n,
    webBaseUrl: 'http://dashboard.test',
    webauthn: options.rejectingVerifier ? createRejectingWebAuthnVerifier() : fakeWebAuthn(),
    passkeyRequired: options.required ?? false,
    now: () => t,
  });

  const userOf = (googleSub: string) => {
    const userId = services.accounts.loginWithGoogle({
      googleSub,
      email: `${googleSub}@example.com`,
    });
    const agent: AgentContext = {
      userId,
      apiKeyId: services.apiKeys.create(userId, 'a').apiKey.id,
    };
    const session = (): UserContext => ({ userId, loggedInAt: t.toISOString() });
    return { userId, agent, session };
  };
  const alice = userOf('alice');
  const bob = userOf('bob');

  /** Registers a passkey for a user with a fresh login (the first) or a proof (any further). */
  const register = async (user: typeof alice, credentialId: string, proof?: PasskeyProof) => {
    const { registrationId, options } = await services.passkeys.startRegistration(
      user.session(),
      proof,
    );
    return services.passkeys.finishRegistration(user.userId, {
      registrationId,
      name: credentialId,
      response: fakeRegistration(credentialId, options),
    });
  };

  /** What the dashboard does on Approve → Touch ID. */
  const prove = async (
    userId: string,
    action: StepUpAction,
    credentialId = 'laptop',
    valid = true,
  ): Promise<PasskeyProof> => {
    const challenge = await services.passkeys.createStepUp(userId, action);
    return {
      challengeId: challenge.challengeId,
      assertion: fakeAssertion(credentialId, challenge.options, valid),
    };
  };

  const submit = (user: typeof alice) => services.intents.submit(user.agent, proposal).intentId;
  const intentStatus = (user: typeof alice, intentId: string) =>
    services.intents.getForUser(user.userId, intentId).status;

  return { ...services, store, advance, alice, bob, register, prove, submit, intentStatus };
}

const expectCode = (code: string) => expect.objectContaining({ code });

describe('PasskeyService: registration', () => {
  it('registers the first passkey only right after a Google login', async () => {
    const { passkeys, alice, advance, register } = setup();
    const staleSession = alice.session();
    advance(FRESH_LOGIN_MS + 1);
    await expect(passkeys.startRegistration(staleSession)).rejects.toThrow(
      expectCode('reauth_required'),
    );

    const passkey = await register(alice, 'laptop');
    expect(passkey).toMatchObject({ id: expect.stringMatching(/^pk_/), name: 'laptop' });
    expect(passkeys.list(alice.userId)).toEqual([passkey]);
  });

  it('needs a proof from an existing passkey to add another one', async () => {
    const { passkeys, alice, register, prove } = setup();
    await register(alice, 'laptop');

    await expect(passkeys.startRegistration(alice.session())).rejects.toThrow(
      expectCode('passkey_required'),
    );
    const proof = await prove(alice.userId, { type: 'add_passkey' });
    await register(alice, 'phone', proof);
    expect(passkeys.list(alice.userId).map((p) => p.name)).toEqual(['laptop', 'phone']);
  });

  it('uses each registration once', async () => {
    const { passkeys, alice } = setup();
    const { registrationId, options } = await passkeys.startRegistration(alice.session());
    const input = { registrationId, name: 'laptop', response: fakeRegistration('laptop', options) };
    await passkeys.finishRegistration(alice.userId, input);
    await expect(passkeys.finishRegistration(alice.userId, input)).rejects.toThrow(
      expectCode('challenge_used'),
    );
  });

  it('rejects a registration finished after it expired', async () => {
    const { passkeys, alice, advance } = setup();
    const { registrationId, options } = await passkeys.startRegistration(alice.session());
    advance(REGISTRATION_TTL_MS + 1);
    await expect(
      passkeys.finishRegistration(alice.userId, {
        registrationId,
        name: 'laptop',
        response: fakeRegistration('laptop', options),
      }),
    ).rejects.toThrow(expectCode('challenge_expired'));
    expect(passkeys.list(alice.userId)).toEqual([]);
  });

  it('rejects a registration the verifier does not accept', async () => {
    const { passkeys, alice } = setup();
    const { registrationId } = await passkeys.startRegistration(alice.session());
    await expect(
      passkeys.finishRegistration(alice.userId, {
        registrationId,
        name: 'laptop',
        response: { id: 'laptop', challenge: 'some other challenge' },
      }),
    ).rejects.toThrow(expectCode('passkey_invalid'));
    expect(passkeys.list(alice.userId)).toEqual([]);
  });

  it('removes a passkey only with a proof', async () => {
    const { passkeys, alice, register, prove } = setup();
    const { id } = await register(alice, 'laptop');
    const proof = await prove(alice.userId, { type: 'remove_passkey', passkeyId: id });
    await passkeys.remove(alice.userId, id, proof);
    expect(passkeys.list(alice.userId)).toEqual([]);
  });
});

describe('PasskeyService + ApprovalService: approving an intent', () => {
  it('approves with a valid proof and records the passkey use', async () => {
    const { approvals, passkeys, alice, register, prove, submit } = setup();
    await register(alice, 'laptop');
    const intentId = submit(alice);

    const challenge = await passkeys.createStepUp(alice.userId, {
      type: 'approve_intent',
      intentId,
    });
    // The dashboard shows what the gateway computed, not what the browser sent.
    expect(challenge.summary).toEqual({
      type: 'approve_intent',
      purpose: proposal.purpose,
      budget: '1000000',
      maxPerPurchase: '250000',
      plannedPurchases: 4,
    });
    const proof = {
      challengeId: challenge.challengeId,
      assertion: fakeAssertion('laptop', challenge.options),
    };

    expect(await approvals.approveIntent(alice.userId, intentId, proof)).toMatchObject({
      status: 'approved',
    });
    expect(passkeys.list(alice.userId)[0]!.lastUsedAt).toBeDefined();
  });

  it('never accepts the same proof twice', async () => {
    const { approvals, alice, register, prove, submit } = setup();
    await register(alice, 'laptop');
    const intentId = submit(alice);
    const proof = await prove(alice.userId, { type: 'approve_intent', intentId });
    await approvals.approveIntent(alice.userId, intentId, proof);

    await expect(approvals.approveIntent(alice.userId, intentId, proof)).rejects.toThrow(
      expectCode('challenge_used'),
    );
  });

  it('rejects a proof made for another intent and leaves that intent pending', async () => {
    const { approvals, intents, alice, register, prove, submit, intentStatus } = setup();
    await register(alice, 'laptop');
    const first = submit(alice);
    const proofForFirst = await prove(alice.userId, { type: 'approve_intent', intentId: first });
    intents.reject(alice.userId, first);
    const second = submit(alice);

    await expect(approvals.approveIntent(alice.userId, second, proofForFirst)).rejects.toThrow(
      expectCode('approval_target_changed'),
    );
    expect(intentStatus(alice, second)).toBe('pending_approval');
  });

  it('burns the challenge when the signature is wrong', async () => {
    const { approvals, alice, register, submit, intentStatus, passkeys } = setup();
    await register(alice, 'laptop');
    const intentId = submit(alice);
    const challenge = await passkeys.createStepUp(alice.userId, {
      type: 'approve_intent',
      intentId,
    });
    const bad = {
      challengeId: challenge.challengeId,
      assertion: fakeAssertion('laptop', challenge.options, false),
    };
    await expect(approvals.approveIntent(alice.userId, intentId, bad)).rejects.toThrow(
      expectCode('passkey_invalid'),
    );

    // Even a good signature for that challenge is useless now.
    const good = { ...bad, assertion: fakeAssertion('laptop', challenge.options) };
    await expect(approvals.approveIntent(alice.userId, intentId, good)).rejects.toThrow(
      expectCode('challenge_used'),
    );
    expect(intentStatus(alice, intentId)).toBe('pending_approval');
  });

  it('rejects an expired challenge', async () => {
    const { approvals, alice, register, prove, submit, advance, intentStatus } = setup();
    await register(alice, 'laptop');
    const intentId = submit(alice);
    const proof = await prove(alice.userId, { type: 'approve_intent', intentId });
    advance(STEP_UP_TTL_MS + 1);
    await expect(approvals.approveIntent(alice.userId, intentId, proof)).rejects.toThrow(
      expectCode('challenge_expired'),
    );
    expect(intentStatus(alice, intentId)).toBe('pending_approval');
  });

  it("does not accept another user's challenge or passkey", async () => {
    const { approvals, alice, bob, register, prove, submit, intentStatus } = setup();
    await register(alice, 'laptop');
    await register(bob, 'bobs-laptop');
    const intentId = submit(alice);
    const bobsProof = await prove(bob.userId, { type: 'add_passkey' }, 'bobs-laptop');

    await expect(approvals.approveIntent(alice.userId, intentId, bobsProof)).rejects.toThrow(
      expectCode('passkey_invalid'),
    );
    // Alice's challenge signed with Bob's passkey.
    const mixed = await prove(alice.userId, { type: 'approve_intent', intentId }, 'bobs-laptop');
    await expect(approvals.approveIntent(alice.userId, intentId, mixed)).rejects.toThrow(
      expectCode('passkey_invalid'),
    );
    expect(intentStatus(alice, intentId)).toBe('pending_approval');
  });

  it('fails closed when the verifier rejects everything', async () => {
    const { approvals, passkeys, store, alice, submit, intentStatus } = setup({
      rejectingVerifier: true,
    });
    // A passkey stored earlier; this verifier never accepts a signature.
    store.passkeys.insert({
      id: 'pk_00000000-0000-4000-8000-000000000001',
      userId: alice.userId,
      credentialId: 'laptop',
      publicKey: 'pub',
      counter: 0,
      transports: [],
      name: 'laptop',
      createdAt: '2026-10-20T11:00:00.000Z',
      lastUsedAt: null,
    });
    const intentId = submit(alice);
    const challenge = await passkeys.createStepUp(alice.userId, {
      type: 'approve_intent',
      intentId,
    });
    const proof = {
      challengeId: challenge.challengeId,
      assertion: { id: 'laptop', rawId: 'laptop', type: 'public-key' },
    };
    await expect(approvals.approveIntent(alice.userId, intentId, proof)).rejects.toThrow(
      expectCode('passkey_invalid'),
    );
    expect(intentStatus(alice, intentId)).toBe('pending_approval');
  });
});

describe('ApprovalService without a proof', () => {
  it('still approves while passkeys are optional and the user has none', async () => {
    const { approvals, alice, submit } = setup();
    expect(await approvals.approveIntent(alice.userId, submit(alice))).toMatchObject({
      status: 'approved',
    });
  });

  it('needs a passkey once the user has one, even when not required for everyone', async () => {
    const { approvals, alice, register, submit, intentStatus } = setup();
    await register(alice, 'laptop');
    const intentId = submit(alice);
    await expect(approvals.approveIntent(alice.userId, intentId)).rejects.toThrow(
      expectCode('passkey_required'),
    );
    expect(intentStatus(alice, intentId)).toBe('pending_approval');
  });

  it('needs a passkey from everyone when required', async () => {
    const { approvals, passkeys, alice, submit } = setup({ required: true });
    const intentId = submit(alice);
    await expect(approvals.approveIntent(alice.userId, intentId)).rejects.toThrow(
      expectCode('passkey_not_registered'),
    );
    await expect(
      passkeys.createStepUp(alice.userId, { type: 'approve_intent', intentId }),
    ).rejects.toThrow(expectCode('passkey_not_registered'));
  });

  it('lets the user reject without a passkey', async () => {
    const { intents, alice, register, submit } = setup({ required: true });
    await register(alice, 'laptop');
    expect(intents.reject(alice.userId, submit(alice))).toMatchObject({ status: 'rejected' });
  });
});

describe('PasskeyService + ApprovalService: approving a REVIEW', () => {
  async function withReview() {
    const ctx = setup();
    await ctx.register(ctx.alice, 'laptop');
    const intentId = ctx.submit(ctx.alice);
    await ctx.approvals.approveIntent(
      ctx.alice.userId,
      intentId,
      await ctx.prove(ctx.alice.userId, { type: 'approve_intent', intentId }),
    );
    const result = await ctx.payments.paidFetch(ctx.alice.agent, { url: `${MERCHANT}/paid` });
    expect(result.state).toBe('awaiting_review');
    return { ...ctx, reviewId: result.reviewId! };
  }

  it('shows the amount, recipient and URL and approves with a proof', async () => {
    const { approvals, passkeys, alice, reviewId } = await withReview();
    const challenge = await passkeys.createStepUp(alice.userId, {
      type: 'approve_review',
      reviewId,
    });
    expect(challenge.summary).toMatchObject({
      type: 'approve_review',
      url: `${MERCHANT}/paid`,
      amount: '10000',
      payTo: expect.stringMatching(/^0x[0-9a-fA-F]{40}$/),
      reason: 'subscription',
    });
    const proof = {
      challengeId: challenge.challengeId,
      assertion: fakeAssertion('laptop', challenge.options),
    };
    expect(await approvals.approveReview(alice.userId, reviewId, proof)).toMatchObject({
      status: 'approved',
    });
  });

  it('does not approve a review that was decided after the challenge', async () => {
    const { approvals, reviews, alice, prove, reviewId } = await withReview();
    const proof = await prove(alice.userId, { type: 'approve_review', reviewId });
    reviews.reject(alice.userId, reviewId);
    await expect(approvals.approveReview(alice.userId, reviewId, proof)).rejects.toThrow(
      expectCode('review_not_pending'),
    );
  });
});
