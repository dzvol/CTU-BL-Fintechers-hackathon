import { newId, type ApiKeyId, type Task, type TaskId, type UserId } from '@semanticauth/contracts';
import type { IntentRecord, TaskRecord, TaskRepository, Transaction } from '../../adapters/store';
import type { AgentContext } from '../context';
import { ConflictError, ForbiddenError, NotFoundError } from '../errors';

/** An active task expires after this long. */
export const TASK_TTL_MS = 24 * 60 * 60 * 1000;

export interface TaskService {
  /** The active task bound to the agent's API key, or null. */
  getActiveTask(agent: AgentContext): Task | null;
  listForUser(userId: UserId): Task[];
  getForUser(userId: UserId, taskId: TaskId): Task;
  /** Ends an active task so a new intent can be submitted. */
  close(userId: UserId, taskId: TaskId): Task;

  // Internal, used by other services.
  hasActiveTask(userId: UserId): boolean;
  /** Called by IntentService inside its approval transaction. */
  createFromIntent(intent: IntentRecord): Task;
  /** The key was revoked or rotated. */
  closeForApiKey(apiKeyId: ApiKeyId, at: string): void;
}

const toTask = (record: TaskRecord): Task => ({
  id: record.id,
  intentId: record.intentId,
  userId: record.userId,
  apiKeyId: record.apiKeyId,
  status: record.status,
  budget: record.budget.toString(),
  // TODO(ledger): read spent/reserved from the ledger once it exists.
  spent: '0',
  reserved: '0',
  createdAt: record.createdAt,
  expiresAt: record.expiresAt,
  closedAt: record.closedAt ?? undefined,
});

export function createTaskService(deps: {
  tasks: TaskRepository;
  transaction: Transaction;
  now?: () => Date;
}): TaskService {
  const now = deps.now ?? (() => new Date());
  // Expiry is applied lazily: every read first moves overdue active tasks to `expired`.
  const expireStale = () => deps.tasks.expireStale(now().toISOString());

  const owned = (userId: UserId, taskId: TaskId) => {
    const task = deps.tasks.findById(taskId);
    if (!task) throw new NotFoundError('Task');
    if (task.userId !== userId) throw new ForbiddenError('Task');
    return task;
  };

  return {
    getActiveTask(agent) {
      expireStale();
      const task = deps.tasks.findActiveByApiKey(agent.apiKeyId);
      return task ? toTask(task) : null;
    },

    listForUser(userId) {
      expireStale();
      return deps.tasks.listByUser(userId).map(toTask);
    },

    getForUser(userId, taskId) {
      expireStale();
      return toTask(owned(userId, taskId));
    },

    close(userId, taskId) {
      return deps.transaction(() => {
        expireStale();
        const task = owned(userId, taskId);
        if (!deps.tasks.close(task.id, now().toISOString())) {
          throw new ConflictError('task_not_active', `Task is already ${task.status}`);
        }
        return toTask(deps.tasks.findById(task.id)!);
      });
    },

    hasActiveTask(userId) {
      expireStale();
      return deps.tasks.findActiveByUser(userId) !== undefined;
    },

    createFromIntent(intent) {
      expireStale();
      if (deps.tasks.findActiveByUser(intent.userId)) {
        throw new ConflictError('active_task_exists', 'Close the active task first');
      }
      const createdAt = now();
      const task: TaskRecord = {
        id: newId('task'),
        intentId: intent.id,
        userId: intent.userId,
        apiKeyId: intent.apiKeyId,
        status: 'active',
        budget: intent.budget,
        createdAt: createdAt.toISOString(),
        expiresAt: new Date(createdAt.getTime() + TASK_TTL_MS).toISOString(),
        closedAt: null,
      };
      deps.tasks.insert(task);
      return toTask(task);
    },

    closeForApiKey: (apiKeyId, at) => deps.tasks.closeActiveByApiKey(apiKeyId, at),
  };
}
