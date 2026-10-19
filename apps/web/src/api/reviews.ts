import {
  listResponseSchema,
  ReviewSchema,
  type ReviewId,
  type ReviewStatus,
} from '@semanticauth/contracts';
import { request } from './http';
export const fetchReviews = (status?: ReviewStatus, signal?: AbortSignal) =>
  request(
    status ? `/api/reviews?status=${encodeURIComponent(status)}` : '/api/reviews',
    listResponseSchema(ReviewSchema),
    { signal },
  ).then((r) => r.items);
export const approveReview = (id: ReviewId) =>
  request(`/api/reviews/${encodeURIComponent(id)}/approve`, ReviewSchema, { method: 'POST' });
export const rejectReview = (id: ReviewId) =>
  request(`/api/reviews/${encodeURIComponent(id)}/reject`, ReviewSchema, { method: 'POST' });
