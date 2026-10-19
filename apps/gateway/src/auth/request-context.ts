import type { ApiError, UserId } from '@semanticauth/contracts';
import type { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import type { SessionService } from './session-service';

export const SESSION_COOKIE = 'sa_session';

export interface RequestContext {
  userId: UserId;
}

export type AppEnv = { Variables: { auth: RequestContext } };

/** Dashboard routes: requires a valid user session cookie and sets `c.var.auth`. */
export function requireUserSession(sessions: SessionService): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const token = getCookie(c, SESSION_COOKIE);
    const userId = token ? sessions.resolve(token) : undefined;
    if (!userId) {
      return c.json<ApiError>(
        { error: { code: 'unauthenticated', message: 'Login required' } },
        401,
      );
    }
    c.set('auth', { userId });
    await next();
  };
}
