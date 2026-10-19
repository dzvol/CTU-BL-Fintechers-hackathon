import type { WhoAmI } from '@semanticauth/contracts';
import { Hono } from 'hono';
import { type AgentEnv, requireAgentKey } from '../../auth/request-context';
import type { RateLimiter } from '../../auth/rate-limit';
import type { AccountService } from '../../services/account/account-service';
import type { ApiKeyService } from '../../services/account/api-key-service';
import { apiError } from '../errors';

/** Mounted at /v1. Small REST surface for the CLI; agents otherwise use MCP. */
export function createIntegrationRoutes(deps: {
  accounts: AccountService;
  apiKeys: ApiKeyService;
  rateLimiter: RateLimiter;
}) {
  const app = new Hono<AgentEnv>();
  app.use('*', requireAgentKey(deps.apiKeys, deps.rateLimiter));

  app.get('/whoami', (c) => {
    const { userId, apiKeyId } = c.var.auth;
    const me = deps.accounts.getProfile(userId);
    if (!me) return apiError(c, 401, 'invalid_api_key', 'Key owner no longer exists');
    return c.json<WhoAmI>({ userId, apiKeyId, email: me.email });
  });

  return app;
}
