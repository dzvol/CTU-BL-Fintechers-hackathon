import { listResponseSchema, type Review, ReviewSchema } from '@semanticauth/contracts';
import { request } from './http';

/** Operations waiting for the user's decision. */
export async function fetchPendingReviews(): Promise<Review[]> {
  const { items } = await request('/api/reviews?status=pending', listResponseSchema(ReviewSchema));
  return items;
}

export function approveReview(id: string): Promise<Review> {
  return request(`/api/reviews/${id}/approve`, ReviewSchema, { method: 'POST' });
}

export function rejectReview(id: string): Promise<Review> {
  return request(`/api/reviews/${id}/reject`, ReviewSchema, { method: 'POST' });
}
