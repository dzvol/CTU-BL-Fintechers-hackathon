import { ApiErrorSchema } from '@semanticauth/contracts';
import type { z } from 'zod';

/** A Dashboard API error; `code` is the gateway's machine-readable error code. */
export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

/** Calls the Dashboard API, throws the API's error on failure, parses the response. */
export async function request<T extends z.ZodType>(
  path: string,
  schema: T,
  init: { method?: string; body?: unknown } = {},
): Promise<z.infer<T>> {
  const res = await fetch(path, {
    method: init.method ?? 'GET',
    credentials: 'include',
    headers: init.body === undefined ? undefined : { 'content-type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const body: unknown = res.status === 204 ? undefined : await res.json();
  if (!res.ok) {
    const parsed = ApiErrorSchema.safeParse(body);
    throw parsed.success
      ? new ApiRequestError(parsed.data.error.message, parsed.data.error.code)
      : new ApiRequestError(`HTTP ${res.status}`);
  }
  return schema.parse(body);
}
