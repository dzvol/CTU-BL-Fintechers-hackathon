import { ApiErrorSchema } from '@semanticauth/contracts';
import type { z } from 'zod';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** All dashboard requests stay on the browser's origin, with the owner session cookie. */
export async function request<T extends z.ZodType>(
  path: string,
  schema: T,
  init: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<z.infer<T>> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? 'GET',
      credentials: 'include',
      signal: init.signal,
      headers: init.body === undefined ? undefined : { 'content-type': 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new ApiError(0, 'Gateway unavailable. Check your connection and retry.');
  }
  const body: unknown = res.status === 204 ? undefined : await res.json().catch(() => undefined);
  if (!res.ok) {
    const parsed = ApiErrorSchema.safeParse(body);
    throw new ApiError(
      res.status,
      parsed.success ? parsed.data.error.message : `Gateway request failed (HTTP ${res.status})`,
      parsed.success ? parsed.data.error.code : undefined,
    );
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ApiError(502, 'The gateway returned an unexpected response.');
  return parsed.data;
}
