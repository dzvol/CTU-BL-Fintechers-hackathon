import { type CreatedApiKey, CreatedApiKeySchema } from '@semanticauth/contracts';
import { request } from './http';

/** Creates an agent API key (revoking the previous one). The `key` is shown only this once. */
export function createApiKey(name: string): Promise<CreatedApiKey> {
  return request('/api/keys', CreatedApiKeySchema, { method: 'POST', body: { name } });
}
