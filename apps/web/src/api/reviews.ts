import {
  listResponseSchema,
  type PasskeyProof,
  type Review,
  ReviewSchema,
} from '@semanticauth/contracts';
import { request } from './http';

/** Operations waiting for the user's decision. */
export async function fetchPendingReviews(): Promise<Review[]> {
  const { items } = await request('/api/reviews?status=pending', listResponseSchema(ReviewSchema));
  return items;
}

/** `proof` is required once the user has a passkey (or the gateway requires passkeys). */
export function approveReview(id: string, proof?: PasskeyProof): Promise<Review> {
  return request(`/api/reviews/${id}/approve`, ReviewSchema, {
    method: 'POST',
    body: proof ? { proof } : undefined,
  });
}

export function rejectReview(id: string): Promise<Review> {
  return request(`/api/reviews/${id}/reject`, ReviewSchema, { method: 'POST' });
}
