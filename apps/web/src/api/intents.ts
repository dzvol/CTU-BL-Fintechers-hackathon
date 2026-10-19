import { type Intent, IntentSchema, listResponseSchema } from '@semanticauth/contracts';
import { request } from './http';

/** The intent waiting for approval, if any (there is at most one). */
export async function fetchPendingIntent(): Promise<Intent | undefined> {
  const { items } = await request(
    '/api/intents?status=pending_approval',
    listResponseSchema(IntentSchema),
  );
  return items[0];
}

export function approveIntent(id: string): Promise<Intent> {
  return request(`/api/intents/${id}/approve`, IntentSchema, { method: 'POST' });
}

export function rejectIntent(id: string): Promise<Intent> {
  return request(`/api/intents/${id}/reject`, IntentSchema, { method: 'POST' });
}
