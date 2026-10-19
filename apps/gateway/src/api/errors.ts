import type { ApiError } from '@semanticauth/contracts';
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

export function apiError(c: Context, status: ContentfulStatusCode, code: string, message: string) {
  return c.json<ApiError>({ error: { code, message } }, status);
}
