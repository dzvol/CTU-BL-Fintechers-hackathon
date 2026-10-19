import type { Task, TaskId, UserId } from '@semanticauth/contracts';
import type { AgentContext } from '../context';
import { notImplemented } from '../errors';

/** An active task expires after this long. */
export const TASK_TTL_MS = 24 * 60 * 60 * 1000;

export interface TaskService {
  /** The active task bound to the agent's API key, or null. */
  getActiveTask(agent: AgentContext): Task | null;
  listForUser(userId: UserId): Task[];
  getForUser(userId: UserId, taskId: TaskId): Task;
  /** Ends an active task so the key can get a new one. */
  close(userId: UserId, taskId: TaskId): Task;
}

// TODO: implement (TaskService). Until then every call answers 501.
export function createTaskService(): TaskService {
  return {
    getActiveTask: notImplemented('task.getActiveTask'),
    listForUser: notImplemented('task.listForUser'),
    getForUser: notImplemented('task.getForUser'),
    close: notImplemented('task.close'),
  };
}
