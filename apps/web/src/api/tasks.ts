import { listResponseSchema, type Task, TaskSchema } from '@semanticauth/contracts';
import { request } from './http';

/** The active task, if any (there is at most one). */
export async function fetchActiveTask(): Promise<Task | undefined> {
  const { items } = await request('/api/tasks', listResponseSchema(TaskSchema));
  return items.find((task) => task.status === 'active');
}

export function closeTask(id: string): Promise<Task> {
  return request(`/api/tasks/${id}/close`, TaskSchema, { method: 'POST' });
}
