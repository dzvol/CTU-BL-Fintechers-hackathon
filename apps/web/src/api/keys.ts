import {
  ApiKeySchema,
  CreatedApiKeySchema,
  CreateApiKeyInputSchema,
  listResponseSchema,
  type ApiKeyId,
} from '@semanticauth/contracts';
import { request } from './http';
export const fetchKeys = (signal?: AbortSignal) =>
  request('/api/keys', listResponseSchema(ApiKeySchema), { signal }).then((r) => r.items);
export const createApiKey = (name: string) =>
  request('/api/keys', CreatedApiKeySchema, {
    method: 'POST',
    body: CreateApiKeyInputSchema.parse({ name }),
  });
export const revokeApiKey = (id: ApiKeyId) =>
  request(`/api/keys/${encodeURIComponent(id)}`, ApiKeySchema, { method: 'DELETE' });
