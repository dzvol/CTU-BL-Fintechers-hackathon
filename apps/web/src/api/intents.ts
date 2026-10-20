import {
  type Intent,
  IntentSchema,
  listResponseSchema,
  type PasskeyProof,
} from '@semanticauth/contracts';
import { request } from './http';

/** The intent waiting for approval, if any (there is at most one). */
export async function fetchPendingIntent(): Promise<Intent | undefined> {
  const { items } = await request(
    '/api/intents?status=pending_approval',
    listResponseSchema(IntentSchema),
  );
  return items[0];
}

/** `proof` is required once the user has a passkey (or the gateway requires passkeys). */
export function approveIntent(id: string, proof?: PasskeyProof): Promise<Intent> {
  return request(`/api/intents/${id}/approve`, IntentSchema, {
    method: 'POST',
    body: proof ? { proof } : undefined,
  });
}

export function rejectIntent(id: string): Promise<Intent> {
  return request(`/api/intents/${id}/reject`, IntentSchema, { method: 'POST' });
}
