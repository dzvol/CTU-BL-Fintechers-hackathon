import { listResponseSchema, TaskSchema, type TaskId } from '@semanticauth/contracts';
import { request } from './http';
export const fetchTasks = (signal?: AbortSignal) =>
  request('/api/tasks', listResponseSchema(TaskSchema), { signal }).then((r) => r.items);
export const closeTask = (id: TaskId) =>
  request(`/api/tasks/${encodeURIComponent(id)}/close`, TaskSchema, { method: 'POST' });
