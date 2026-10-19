import { Hono } from 'hono';
import { csrf } from 'hono/csrf';
import {
  createGoogleOAuthClient,
  type GoogleOAuthClient,
} from './adapters/google-oauth/google-oauth-client';
import { createStore, openDatabase } from './adapters/store';
import { createAuthRoutes } from './api/dashboard/auth-routes';
import { createDashboardRoutes } from './api/dashboard/dashboard-routes';
import { handleError } from './api/errors';
import { createIntegrationRoutes } from './api/integration/integration-routes';
import { createRateLimiter } from './auth/rate-limit';
import { createSessionService } from './auth/session-service';
import type { Config } from './config';
import { createMcpRoutes } from './mcp/mcp-routes';
import { createServices } from './services';

/** Swappable dependencies, used by tests. */
export interface AppOverrides {
  googleOAuth?: GoogleOAuthClient;
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
    userAllocation: config.userAllocation,
    webBaseUrl: config.webBaseUrl,
    now: overrides.now,
  });
  const { accounts, apiKeys } = services;
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

  return app;
}
