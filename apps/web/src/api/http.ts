import { ApiErrorSchema } from '@semanticauth/contracts';
import type { z } from 'zod';

/** Calls the Dashboard API, throws the API's error message on failure, parses the response. */
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
  const body: unknown = await res.json();
  if (!res.ok) {
    const parsed = ApiErrorSchema.safeParse(body);
    throw new Error(parsed.success ? parsed.data.error.message : `HTTP ${res.status}`);
  }
  return schema.parse(body);
}
