import { listResponseSchema, OperationSchema } from '@semanticauth/contracts';
import { request } from './http';
export const fetchOperations = (signal?: AbortSignal) =>
  request('/api/operations', listResponseSchema(OperationSchema), { signal }).then((r) => r.items);
export const fetchOperation = (id: string, signal?: AbortSignal) =>
  request(`/api/operations/${encodeURIComponent(id)}`, OperationSchema, { signal });
