import type { ApiKeyId, IntentId, TaskId, TaskStatus, UserId } from '@semanticauth/contracts';
import type { Db } from './db';

export interface TaskRecord {
  id: TaskId;
  intentId: IntentId;
  userId: UserId;
  apiKeyId: ApiKeyId;
  status: TaskStatus;
  budget: bigint;
  createdAt: string;
  expiresAt: string;
  closedAt: string | null;
}

export interface TaskRepository {
  insert(task: TaskRecord): void;
  findById(id: TaskId): TaskRecord | undefined;
  listByUser(userId: UserId): TaskRecord[];
  findActiveByUser(userId: UserId): TaskRecord | undefined;
  findActiveByApiKey(apiKeyId: ApiKeyId): TaskRecord | undefined;
  /** active → closed; false if it was no longer active. */
  close(id: TaskId, at: string): boolean;
  /** Marks active tasks past `expires_at` as expired. */
  expireStale(now: string): void;
  /** The key was revoked: its active task can never be used. */
  closeActiveByApiKey(apiKeyId: ApiKeyId, at: string): void;
}

interface TaskRow {
  id: string;
  intent_id: string;
  user_id: string;
  api_key_id: string;
  status: TaskStatus;
  budget: string;
  created_at: string;
  expires_at: string;
  closed_at: string | null;
}

const toRecord = (row: TaskRow): TaskRecord => ({
  id: row.id,
  intentId: row.intent_id,
  userId: row.user_id,
  apiKeyId: row.api_key_id,
  status: row.status,
  budget: BigInt(row.budget),
  createdAt: row.created_at,
  expiresAt: row.expires_at,
  closedAt: row.closed_at,
});

export function createTaskRepository(db: Db): TaskRepository {
  const insert = db.prepare(
    `INSERT INTO tasks (id, intent_id, user_id, api_key_id, status, budget, created_at,
       expires_at, closed_at)
     VALUES (@id, @intentId, @userId, @apiKeyId, @status, @budget, @createdAt, @expiresAt,
       @closedAt)`,
  );
  const byId = db.prepare<[string], TaskRow>('SELECT * FROM tasks WHERE id = ?');
  const byUser = db.prepare<[string], TaskRow>(
    'SELECT * FROM tasks WHERE user_id = ? ORDER BY created_at DESC',
  );
  const activeByUser = db.prepare<[string], TaskRow>(
    "SELECT * FROM tasks WHERE user_id = ? AND status = 'active'",
  );
  const activeByKey = db.prepare<[string], TaskRow>(
    "SELECT * FROM tasks WHERE api_key_id = ? AND status = 'active'",
  );
  const close = db.prepare(
    "UPDATE tasks SET status = 'closed', closed_at = ? WHERE id = ? AND status = 'active'",
  );
  const expireStale = db.prepare(
    `UPDATE tasks SET status = 'expired', closed_at = expires_at
     WHERE status = 'active' AND expires_at <= ?`,
  );
  const closeByKey = db.prepare(
    "UPDATE tasks SET status = 'closed', closed_at = ? WHERE api_key_id = ? AND status = 'active'",
  );

  const one = (row: TaskRow | undefined) => row && toRecord(row);

  return {
    insert: (task) => void insert.run({ ...task, budget: task.budget.toString() }),
    findById: (id) => one(byId.get(id)),
    listByUser: (userId) => byUser.all(userId).map(toRecord),
    findActiveByUser: (userId) => one(activeByUser.get(userId)),
    findActiveByApiKey: (apiKeyId) => one(activeByKey.get(apiKeyId)),
    close: (id, at) => close.run(at, id).changes === 1,
    expireStale: (now) => void expireStale.run(now),
    closeActiveByApiKey: (apiKeyId, at) => void closeByKey.run(at, apiKeyId),
  };
}
