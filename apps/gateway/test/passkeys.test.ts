import type { IntentProposal, StepUpChallenge } from '@semanticauth/contracts';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { fakeMerchantTransport } from './fake-merchant';
import { fakeAssertion, fakeRegistration, fakeWebAuthn } from './fake-webauthn';
import { asUser, connectMcp, cookiesFrom, fakeGoogle, testConfig } from './helpers';

const proposal: IntentProposal = {
  purpose: 'Buy market data for a research note',
  task: "Get a snapshot of today's crypto market",
  allowedPurchases: ['market data APIs'],
  forbidden: ['trading or investments'],
  budgetUsdc: '1.00',
  maxPerPurchaseUsdc: '0.25',
  plannedPurchases: 4,
};

const createPasskeyApp = (required = false) =>
  createApp(
    { ...testConfig, passkeys: { ...testConfig.passkeys, required } },
    { googleOAuth: fakeGoogle, x402Transport: fakeMerchantTransport(), webauthn: fakeWebAuthn() },
  );

async function setup(required = false) {
  const app = createPasskeyApp(required);
  const start = await app.request('/auth/google/login');
  const state = new URL(start.headers.get('location')!).searchParams.get('state');
  const callback = await app.request(`/auth/google/callback?code=alice&state=${state}`, {
    headers: { cookie: cookiesFrom(start) },
  });
  const sessionCookie = cookiesFrom(callback);
  const api = (path: string, init: RequestInit = {}) => asUser(app, sessionCookie, path, init);
  const post = (path: string, body?: unknown) =>
    api(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });

  const keyRes = await post('/api/keys', { name: 'claude-code' });
  const { key } = (await keyRes.json()) as { key: string };
  const agent = await connectMcp(app, key);
  const submitIntent = async () => {
    const result = await agent.callTool({ name: 'submit_intent', arguments: proposal });
    return (result.structuredContent as { intentId: string }).intentId;
  };

  const registerPasskey = async (credentialId = 'laptop') => {
    const optionsRes = await post('/api/passkeys/registration/options');
    expect(optionsRes.status).toBe(200);
    const { registrationId, options } = (await optionsRes.json()) as {
      registrationId: string;
      options: Record<string, unknown>;
    };
    const verify = await post('/api/passkeys/registration/verify', {
      registrationId,
      name: 'MacBook',
      response: fakeRegistration(credentialId, options),
    });
    expect(verify.status).toBe(201);
  };

  const stepUp = async (action: Record<string, unknown>) => {
    const res = await post('/api/step-up/challenge', { action });
    expect(res.status).toBe(200);
    return (await res.json()) as StepUpChallenge;
  };

  return { app, key, api, post, submitIntent, registerPasskey, stepUp };
}

const errorCode = async (res: Response) =>
  ((await res.json()) as { error: { code: string } }).error.code;

describe('passkey approvals over the Dashboard API', () => {
  it('registers a passkey and approves an intent with Touch ID', async () => {
    const { api, post, submitIntent, registerPasskey, stepUp } = await setup();
    await registerPasskey();
    const list = await api('/api/passkeys');
    expect(await list.json()).toMatchObject({ items: [{ name: 'MacBook' }] });

    const intentId = await submitIntent();
    // Once a passkey exists, a plain approve is refused.
    const plain = await post(`/api/intents/${intentId}/approve`);
    expect(plain.status).toBe(401);
    expect(await errorCode(plain)).toBe('passkey_required');

    const challenge = await stepUp({ type: 'approve_intent', intentId });
    expect(challenge.summary).toMatchObject({ type: 'approve_intent', budget: '1000000' });
    const proof = {
      challengeId: challenge.challengeId,
      assertion: fakeAssertion('laptop', challenge.options),
    };
    const approved = await post(`/api/intents/${intentId}/approve`, { proof });
    expect(approved.status).toBe(200);
    expect(await approved.json()).toMatchObject({ status: 'approved' });

    const replay = await post(`/api/intents/${intentId}/approve`, { proof });
    expect(replay.status).toBe(401);
    expect(await errorCode(replay)).toBe('challenge_used');
  });

  it('keeps the old flow while passkeys are optional and the user has none', async () => {
    const { post, submitIntent } = await setup();
    const intentId = await submitIntent();
    const res = await post(`/api/intents/${intentId}/approve`);
    expect(res.status).toBe(200);
  });

  it('refuses approvals without a passkey when PASSKEY_REQUIRED is on, but allows reject', async () => {
    const { post, submitIntent } = await setup(true);
    const intentId = await submitIntent();
    const approve = await post(`/api/intents/${intentId}/approve`);
    expect(approve.status).toBe(401);
    expect(await errorCode(approve)).toBe('passkey_not_registered');

    const reject = await post(`/api/intents/${intentId}/reject`);
    expect(reject.status).toBe(200);
  });

  it('needs a proof to add a second passkey', async () => {
    const { post, registerPasskey } = await setup();
    await registerPasskey();
    const res = await post('/api/passkeys/registration/options');
    expect(res.status).toBe(401);
    expect(await errorCode(res)).toBe('passkey_required');
  });

  it('validates the proof body', async () => {
    const { post, submitIntent, registerPasskey } = await setup();
    await registerPasskey();
    const intentId = await submitIntent();
    const res = await post(`/api/intents/${intentId}/approve`, { proof: { challengeId: 'nope' } });
    expect(res.status).toBe(400);
  });

  it('is not reachable with an agent API key', async () => {
    const { app, key } = await setup();
    for (const path of ['/api/passkeys', '/api/step-up/challenge']) {
      const res = await app.request(path, {
        method: path.endsWith('challenge') ? 'POST' : 'GET',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: path.endsWith('challenge')
          ? JSON.stringify({ action: { type: 'add_passkey' } })
          : undefined,
      });
      expect(res.status).toBe(401);
    }
  });
});
