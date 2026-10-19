import { newId, type ApiKeyId, type Task, type TaskId, type UserId } from '@semanticauth/contracts';
import type {
  IntentRecord,
  LedgerRepository,
  TaskRecord,
  TaskRepository,
  Transaction,
} from '../../adapters/store';
import type { Balance } from '../../domain/ledger';
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

const toTask = (record: TaskRecord, balance: Balance): Task => ({
  id: record.id,
  intentId: record.intentId,
  userId: record.userId,
  apiKeyId: record.apiKeyId,
  status: record.status,
  budget: record.budget.toString(),
  spent: balance.spent.toString(),
  reserved: balance.reserved.toString(),
  createdAt: record.createdAt,
  expiresAt: record.expiresAt,
  closedAt: record.closedAt ?? undefined,
});

export function createTaskService(deps: {
  tasks: TaskRepository;
  ledger: Pick<LedgerRepository, 'taskBalance'>;
  transaction: Transaction;
  now?: () => Date;
}): TaskService {
  const now = deps.now ?? (() => new Date());
  // Expiry is applied lazily: every read first moves overdue active tasks to `expired`.
  const expireStale = () => deps.tasks.expireStale(now().toISOString());
  const view = (record: TaskRecord) => toTask(record, deps.ledger.taskBalance(record.id));

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
      return task ? view(task) : null;
    },

    listForUser(userId) {
      expireStale();
      return deps.tasks.listByUser(userId).map(view);
    },

    getForUser(userId, taskId) {
      expireStale();
      return view(owned(userId, taskId));
    },

    close(userId, taskId) {
      return deps.transaction(() => {
        expireStale();
        const task = owned(userId, taskId);
        if (!deps.tasks.close(task.id, now().toISOString())) {
          throw new ConflictError('task_not_active', `Task is already ${task.status}`);
        }
        return view(deps.tasks.findById(task.id)!);
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
      return view(task);
    },

    closeForApiKey: (apiKeyId, at) => deps.tasks.closeActiveByApiKey(apiKeyId, at),
  };
}
