import { IntentSchema, listResponseSchema, type IntentId } from '@semanticauth/contracts';
import { request } from './http';
export const fetchIntents = (signal?: AbortSignal) =>
  request('/api/intents', listResponseSchema(IntentSchema), { signal }).then((r) => r.items);
export const fetchIntent = (id: string, signal?: AbortSignal) =>
  request(`/api/intents/${encodeURIComponent(id)}`, IntentSchema, { signal });
export const approveIntent = (id: IntentId) =>
  request(`/api/intents/${encodeURIComponent(id)}/approve`, IntentSchema, { method: 'POST' });
export const rejectIntent = (id: IntentId) =>
  request(`/api/intents/${encodeURIComponent(id)}/reject`, IntentSchema, { method: 'POST' });
