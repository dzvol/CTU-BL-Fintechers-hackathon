import { Hono } from 'hono';
import { csrf } from 'hono/csrf';
import {
  createGoogleOAuthClient,
  type GoogleOAuthClient,
} from './adapters/google-oauth/google-oauth-client';
import { createStore, openDatabase } from './adapters/store';
import { createAuthRoutes } from './api/dashboard/auth-routes';
import { createDashboardRoutes } from './api/dashboard/dashboard-routes';
import { createSessionService } from './auth/session-service';
import type { Config } from './config';
import { createAccountService } from './services/account/account-service';

/** Swappable output adapters, used by tests. */
export interface AppOverrides {
  googleOAuth?: GoogleOAuthClient;
}

export function createApp(config: Config, overrides: AppOverrides = {}) {
  const store = createStore(openDatabase(config.databasePath));
  const google = overrides.googleOAuth ?? (config.google && createGoogleOAuthClient(config.google));

  const sessions = createSessionService({ sessions: store.sessions });
  const accounts = createAccountService({
    users: store.users,
    allocations: store.allocations,
    transaction: store.transaction,
    defaultAllocation: config.userAllocation,
  });

  const app = new Hono();
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
  app.route('/api', createDashboardRoutes({ accounts, sessions }));

  return app;
}
