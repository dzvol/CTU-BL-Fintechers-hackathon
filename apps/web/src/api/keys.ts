import { ApiErrorSchema, type CreatedApiKey, CreatedApiKeySchema } from '@semanticauth/contracts';

/** Creates an agent API key. The returned `key` is shown only this once. */
export async function createApiKey(name: string): Promise<CreatedApiKey> {
  const res = await fetch('/api/keys', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  const body: unknown = await res.json();
  if (!res.ok) {
    const parsed = ApiErrorSchema.safeParse(body);
    throw new Error(parsed.success ? parsed.data.error.message : `HTTP ${res.status}`);
  }
  return CreatedApiKeySchema.parse(body);
}
