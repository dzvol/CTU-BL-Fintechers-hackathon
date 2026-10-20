import type { FacilitatorClient } from '@x402/core/server';
import { describe, expect, it } from 'vitest';
import { BASE_SEPOLIA, createApp } from './app';
import type { Env } from './env';
import { OTHER_TOKEN_ADDRESS, SCENARIOS } from './scenarios';

const env: Env = {
  MERCHANTS_PORT: 4021,
  MERCHANT_PAY_TO: '0x1111111111111111111111111111111111111111',
  USDC_ADDRESS: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  X402_FACILITATOR_URL: 'https://x402.org/facilitator',
};

// Offline stand-in: advertises the one kind we use and never settles anything.
const fakeFacilitator: FacilitatorClient = {
  getSupported: async () => ({
    kinds: [{ x402Version: 2, scheme: 'exact', network: BASE_SEPOLIA }],
    extensions: [],
    signers: {},
  }),
  verify: async () => ({ isValid: false, invalidReason: 'fake_facilitator' }),
  settle: async () => {
    throw new Error('fake facilitator never settles');
  },
};

const app = createApp(env, { facilitator: fakeFacilitator });

function decodePaymentRequired(header: string | null): unknown {
  expect(header).toBeTruthy();
  return JSON.parse(Buffer.from(header ?? '', 'base64').toString('utf8'));
}

describe('test merchants', () => {
  it('serves free content without payment', async () => {
    const res = await app.request('/free/market-headlines');
    expect(res.status).toBe(200);
  });

  for (const scenario of SCENARIOS.filter((s) => s.offer)) {
    it(`${scenario.path} answers 402 with its x402 offer`, async () => {
      const res = await app.request(scenario.path);
      expect(res.status).toBe(402);

      const required = decodePaymentRequired(res.headers.get('payment-required')) as {
        accepts: Array<Record<string, unknown>>;
        resource: Record<string, unknown>;
      };
      const offer = required.accepts[0];
      expect(offer).toMatchObject({
        scheme: 'exact',
        network: BASE_SEPOLIA,
        payTo: env.MERCHANT_PAY_TO,
        amount: scenario.offer?.amount,
        asset: scenario.offer?.asset === 'usdc' ? env.USDC_ADDRESS : OTHER_TOKEN_ADDRESS,
      });
      expect(required.resource.description).toBe(scenario.offer?.description);

      const body = (await res.json()) as { message?: string };
      expect(body.message).toBe(scenario.offer?.unpaidBody);
    });
  }

  it('never uses the attacker address as payTo', async () => {
    for (const scenario of SCENARIOS.filter((s) => s.offer)) {
      const res = await app.request(scenario.path);
      const required = decodePaymentRequired(res.headers.get('payment-required')) as {
        accepts: Array<{ payTo: string }>;
      };
      expect(required.accepts.every((a) => a.payTo === env.MERCHANT_PAY_TO)).toBe(true);
    }
  });

  it('lists the advertised offers in a free catalog with HTTPS links behind the proxy', async () => {
    const res = await app.request('http://merchants.internal/catalog', {
      headers: { 'x-forwarded-proto': 'https' },
    });
    expect(res.status).toBe(200);
    const { offers } = (await res.json()) as {
      offers: Array<{ title: string; summary: string; priceUsdc: string; url: string }>;
    };
    expect(offers.map((o) => o.url)).toEqual(
      SCENARIOS.filter((s) => s.listing).map((s) => `https://merchants.internal${s.path}`),
    );
    expect(offers.find((o) => o.title === 'Czech SME Overview 2026')?.priceUsdc).toBe('0.05');
    // Adversarial routes are not advertised: the agent only finds them if it is pointed there.
    expect(offers.some((o) => /injection|recipient|off-intent/.test(o.url))).toBe(false);
  });

  it('advertises the market entry pack without saying what the offer says', () => {
    const pack = SCENARIOS.find((s) => s.path === '/datanest/market-entry-pack')!;
    expect(pack.listing?.summary).not.toMatch(/US|consumer/);
    expect(pack.offer?.description).toMatch(/US consumers/);
  });
});
