import type { Task, TaskId, UserId } from '@semanticauth/contracts';
import { ConflictError } from '../services/errors';
import type { TaskService } from '../services/task/task-service';

export interface ReconciliationWorker {
  /** Close the specific failed task; no retry, refund, or operation-state rewrite. */
  closeFailedTask(userId: UserId, taskId: TaskId): Task;
}

/** Event-driven failure handling: TaskService owns the transaction, clock, and database update. */
export function createReconciliationWorker(deps: {
  tasks: Pick<TaskService, 'close' | 'getForUser'>;
}): ReconciliationWorker {
  return {
    closeFailedTask(userId, taskId) {
      try {
        return deps.tasks.close(userId, taskId);
      } catch (error) {
        if (!(error instanceof ConflictError) || error.code !== 'task_not_active') throw error;
        const task = deps.tasks.getForUser(userId, taskId);
        // Duplicate failure reports must preserve the original terminal state and closed_at.
        if (task.status === 'closed' || task.status === 'expired') return task;
        throw error;
      }
    },
  };
}
