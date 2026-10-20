import type { Context } from 'hono';
import { z } from 'zod';
import { BadRequestError } from '../services/errors';

/** Parses a path param, query value etc.; invalid input becomes a 400. */
export function parse<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) throw new BadRequestError(z.prettifyError(result.error));
  return result.data;
}

export async function parseJsonBody<T extends z.ZodType>(c: Context, schema: T) {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new BadRequestError('Request body must be JSON');
  }
  return parse(schema, body);
}

/** Like parseJsonBody, but an empty body counts as `{}` (for bodies whose fields are optional). */
export async function parseOptionalJsonBody<T extends z.ZodType>(c: Context, schema: T) {
  const text = await c.req.text();
  if (!text.trim()) return parse(schema, {});
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new BadRequestError('Request body must be JSON');
  }
  return parse(schema, body);
}
