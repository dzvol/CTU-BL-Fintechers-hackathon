import { Hono } from 'hono';
import { csrf } from 'hono/csrf';
import { createRpcChainReader, type ChainReader } from './adapters/chain-reader';
import {
  createGoogleOAuthClient,
  type GoogleOAuthClient,
} from './adapters/google-oauth/google-oauth-client';
import {
  createHttpJevClient,
  createUnconfiguredJev,
  type JevClient,
} from './adapters/jev/jev-client';
import { createEoaSigner, type Signer } from './adapters/signer';
import { createStore, openDatabase } from './adapters/store';
import { createHttpX402Transport, type X402Transport } from './adapters/x402';
import { createAuthRoutes } from './api/dashboard/auth-routes';
import { createDashboardRoutes } from './api/dashboard/dashboard-routes';
import { handleError } from './api/errors';
import { createIntegrationRoutes } from './api/integration/integration-routes';
import { mountDashboard } from './api/web-routes';
import { createRateLimiter } from './auth/rate-limit';
import { createSessionService } from './auth/session-service';
import type { Config } from './config';
import { createMcpRoutes } from './mcp/mcp-routes';
import { createServices } from './services';

/** Swappable dependencies, used by tests. */
export interface AppOverrides {
  googleOAuth?: GoogleOAuthClient;
  x402Transport?: X402Transport;
  jev?: JevClient;
  signer?: Signer;
  chainReader?: ChainReader;
  now?: () => Date;
}

/** Per API key, shared by /mcp and /v1. Leaves room for polling get_intent_status. */
const AGENT_RATE_LIMIT = { limit: 120, windowMs: 60_000 };

export function createApp(config: Config, overrides: AppOverrides = {}) {
  const store = createStore(openDatabase(config.databasePath));
  const google = overrides.googleOAuth ?? (config.google && createGoogleOAuthClient(config.google));

  const sessions = createSessionService({ sessions: store.sessions, now: overrides.now });
  const services = createServices({
    store,
    transport:
      overrides.x402Transport ??
      createHttpX402Transport({ allowHttpLocalhost: config.x402AllowHttpLocalhost }),
    jev:
      overrides.jev ??
      (config.jev
        ? createHttpJevClient(config.jev, fetch, config.jevVariant.questions)
        : createUnconfiguredJev()),
    thresholds: config.jevVariant.thresholds,
    // The Signer reads SPONSOR_PRIVATE_KEY itself; an invalid key stops the gateway here.
    signer:
      overrides.signer ??
      (config.payments.signer ? createEoaSigner(config.payments.signer) : undefined),
    chainReader: overrides.chainReader ?? createRpcChainReader(config.payments.chainReader),
    network: config.payments.network,
    poolLimit: config.payments.poolLimit,
    userAllocation: config.userAllocation,
    webBaseUrl: config.webBaseUrl,
    now: overrides.now,
  });
  const { accounts, apiKeys } = services;
  // Before serving: nothing of this process is in flight yet, so anything in flight was interrupted.
  const recovered = services.payments.recoverInterrupted();
  if (recovered > 0) console.warn(`Recovered ${recovered} operation(s) interrupted by a restart`);
  const rateLimiter = createRateLimiter(AGENT_RATE_LIMIT);

  const app = new Hono();
  app.onError(handleError);
  app.use(csrf({ origin: config.webBaseUrl }));

  app.get('/health', (c) => c.json({ status: 'ok' }));
  app.route(
    '/auth',
    createAuthRoutes({
      google,
      accounts,
      sessions,
      sessionSecret: config.sessionSecret,
      secureCookies: config.secureCookies,
    }),
  );
  app.route('/api', createDashboardRoutes({ sessions, ...services }));
  app.route('/v1', createIntegrationRoutes({ accounts, apiKeys, rateLimiter }));
  app.route('/mcp', createMcpRoutes({ ...services, rateLimiter }));
  if (config.webDistDir) mountDashboard(app, config.webDistDir);

  return app;
}
