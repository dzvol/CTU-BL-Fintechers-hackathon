import { Hono } from 'hono';
import { type AppEnv, requireUserSession } from '../../auth/request-context';
import type { SessionService } from '../../auth/session-service';
import type { AccountService } from '../../services/account/account-service';
import { apiError } from '../errors';

/** Mounted at /api. Everything here requires a user session. */
export function createDashboardRoutes(deps: {
  accounts: AccountService;
  sessions: SessionService;
}) {
  const app = new Hono<AppEnv>();
  app.use('*', requireUserSession(deps.sessions));

  app.get('/me', (c) => {
    const me = deps.accounts.getProfile(c.var.auth.userId);
    if (!me) return apiError(c, 401, 'unauthenticated', 'Login required');
    return c.json(me);
  });

  return app;
}
