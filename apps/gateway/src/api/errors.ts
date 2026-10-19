import type { ApiError } from '@semanticauth/contracts';
import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { ServiceError } from '../services/errors';

export function apiError(c: Context, status: ContentfulStatusCode, code: string, message: string) {
  return c.json<ApiError>({ error: { code, message } }, status);
}

/** app.onError: service errors keep their status and code; anything unexpected is a 500. */
export function handleError(err: Error, c: Context) {
  if (err instanceof ServiceError) return apiError(c, err.status, err.code, err.message);
  if (err instanceof HTTPException) return err.getResponse();
  console.error(err);
  return apiError(c, 500, 'internal_error', 'Internal error');
}
