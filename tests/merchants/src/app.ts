import { HTTPFacilitatorClient, type FacilitatorClient } from '@x402/core/server';
import { ExactEvmScheme } from '@x402/evm/exact/server';
import { paymentMiddleware, x402ResourceServer, type Network } from '@x402/hono';
import type { RouteConfig } from '@x402/core/server';
import { Hono } from 'hono';
import type { Env } from './env';
import { OTHER_TOKEN_ADDRESS, SCENARIOS, type Scenario } from './scenarios';

/** x402 v2 uses CAIP-2 network ids. */
export const BASE_SEPOLIA: Network = 'eip155:84532';

function toRouteConfig(scenario: Scenario, env: Env): RouteConfig | undefined {
  const offer = scenario.offer;
  if (!offer) return undefined;

  const asset =
    offer.asset === 'usdc'
      ? // EIP-712 domain of the Base Sepolia USDC contract, needed to verify EIP-3009 signatures.
        { asset: env.USDC_ADDRESS, amount: offer.amount, extra: { name: 'USDC', version: '2' } }
      : { asset: OTHER_TOKEN_ADDRESS, amount: offer.amount, extra: { name: 'EURC', version: '2' } };

  return {
    accepts: {
      scheme: 'exact',
      network: BASE_SEPOLIA,
      payTo: env.MERCHANT_PAY_TO,
      price: asset,
      maxTimeoutSeconds: 120,
    },
    serviceName: offer.serviceName,
    description: offer.description,
    tags: offer.tags,
    mimeType: 'application/json',
    unpaidResponseBody: () => ({
      contentType: 'application/json',
      body: { message: offer.unpaidBody },
    }),
  };
}

export type CreateAppOptions = {
  /** Tests inject a fake; production talks to `X402_FACILITATOR_URL`. */
  facilitator?: FacilitatorClient;
};

export function createApp(env: Env, options: CreateAppOptions = {}) {
  const app = new Hono();

  app.get('/health', (c) => c.json({ status: 'ok' }));

  // For people and acceptance tests, not for the agent under test.
  app.get('/scenarios', (c) =>
    c.json(
      SCENARIOS.map((s) => ({
        path: s.path,
        expected: s.expected,
        decidedBy: s.decidedBy,
        amount: s.offer?.amount ?? null,
      })),
    ),
  );

  const routes: Record<string, RouteConfig> = {};
  for (const scenario of SCENARIOS) {
    const config = toRouteConfig(scenario, env);
    if (config) routes[`GET ${scenario.path}`] = config;
  }

  const facilitator =
    options.facilitator ?? new HTTPFacilitatorClient({ url: env.X402_FACILITATOR_URL });
  const resourceServer = new x402ResourceServer(facilitator).register(
    BASE_SEPOLIA,
    new ExactEvmScheme(),
  );

  app.use(paymentMiddleware(routes, resourceServer));

  for (const scenario of SCENARIOS) {
    app.get(scenario.path, (c) => c.json(scenario.content));
  }

  return app;
}
