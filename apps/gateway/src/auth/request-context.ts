import type { ApiError } from '@semanticauth/contracts';
import type { Context, MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import type { AccountService } from '../services/account/account-service';
import { AllocationExhaustedError, type ApiKeyService } from '../services/account/api-key-service';
import type { AgentContext, UserContext } from '../services/context';
import type { RateLimiter } from './rate-limit';
import type { SessionService } from './session-service';

export type { AgentContext, UserContext } from '../services/context';

export const SESSION_COOKIE = 'sa_session';

/** Routes for the logged-in user (dashboard). */
export type UserEnv = { Variables: { auth: UserContext } };
/** Routes for agents (MCP, integration API). */
export type AgentEnv = { Variables: { auth: AgentContext } };

const unauthorized = (c: Context, code: string, message: string) =>
  c.json<ApiError>({ error: { code, message } }, 401);

/** Dashboard: requires a valid user session cookie and sets `c.var.auth`. */
export function requireUserSession(sessions: SessionService): MiddlewareHandler<UserEnv> {
  return async (c, next) => {
    const token = getCookie(c, SESSION_COOKIE);
    const session = token ? sessions.resolve(token) : undefined;
    if (!session) return unauthorized(c, 'unauthenticated', 'Login required');
    c.set('auth', { userId: session.userId, loggedInAt: session.createdAt });
    await next();
  };
}

/**
 * Agents: requires `Authorization: Bearer <api key>` with a non-revoked key of a user who still
 * has funds left, and sets `c.var.auth`. Rate-limited per key.
 */
export function requireAgentKey(
  apiKeys: ApiKeyService,
  accounts: Pick<AccountService, 'fundsLeft'>,
  rateLimiter: RateLimiter,
): MiddlewareHandler<AgentEnv> {
  return async (c, next) => {
    const header = c.req.header('authorization') ?? '';
    const key = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
    const agent = key ? apiKeys.authenticate(key) : undefined;
    if (!agent) return unauthorized(c, 'invalid_api_key', 'Missing, invalid or revoked API key');
    if (accounts.fundsLeft(agent.userId) <= 0n) {
      const { code, message } = new AllocationExhaustedError();
      return c.json<ApiError>({ error: { code, message } }, 403);
    }
    if (!rateLimiter.hit(agent.apiKeyId)) {
      return c.json<ApiError>(
        { error: { code: 'rate_limited', message: 'Too many requests, slow down' } },
        429,
      );
    }
    c.set('auth', agent);
    await next();
  };
}
