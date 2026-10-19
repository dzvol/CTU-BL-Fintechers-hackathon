import { listResponseSchema, ReviewSchema, type ReviewId } from '@semanticauth/contracts';
import { request } from './http';
// The current gateway returns 501 here. Surface it; never turn unavailable reviews into an empty list.
export const fetchReviews = (signal?: AbortSignal) =>
  request('/api/reviews', listResponseSchema(ReviewSchema), { signal }).then((r) => r.items);
export const approveReview = (id: ReviewId) =>
  request(`/api/reviews/${encodeURIComponent(id)}/approve`, ReviewSchema, { method: 'POST' });
export const rejectReview = (id: ReviewId) =>
  request(`/api/reviews/${encodeURIComponent(id)}/reject`, ReviewSchema, { method: 'POST' });
