import type { ApiKeyId, IntentId, IntentStatus, TaskId, UserId } from '@semanticauth/contracts';
import type { Db } from './db';

export interface IntentRecord {
  id: IntentId;
  userId: UserId;
  apiKeyId: ApiKeyId;
  status: IntentStatus;
  purpose: string;
  task: string;
  allowedPurchases: string[];
  forbidden: string[];
  budget: bigint;
  maxPerPurchase: bigint;
  plannedPurchases: number;
  taskId: TaskId | null;
  createdAt: string;
  expiresAt: string;
  decidedAt: string | null;
}

/** Content is never updated; only status transitions exist. */
export interface IntentRepository {
  insert(intent: IntentRecord): void;
  findById(id: IntentId): IntentRecord | undefined;
  listByUser(userId: UserId, status?: IntentStatus): IntentRecord[];
  findPendingByUser(userId: UserId): IntentRecord | undefined;
  /** pending_approval → approved/rejected; false if it was no longer pending. */
  decide(
    id: IntentId,
    to: 'approved' | 'rejected',
    decidedAt: string,
    taskId: TaskId | null,
  ): boolean;
  /** Marks pending intents past `expires_at` as expired. */
  expireStale(now: string): void;
  /** The key was revoked: its pending intent can never be used. */
  expirePendingByApiKey(apiKeyId: ApiKeyId, at: string): void;
}

interface IntentRow {
  id: string;
  user_id: string;
  api_key_id: string;
  status: IntentStatus;
  purpose: string;
  task: string;
  allowed_purchases: string;
  forbidden: string;
  budget: string;
  max_per_purchase: string;
  planned_purchases: number;
  task_id: string | null;
  created_at: string;
  expires_at: string;
  decided_at: string | null;
}

const toRecord = (row: IntentRow): IntentRecord => ({
  id: row.id,
  userId: row.user_id,
  apiKeyId: row.api_key_id,
  status: row.status,
  purpose: row.purpose,
  task: row.task,
  allowedPurchases: JSON.parse(row.allowed_purchases) as string[],
  forbidden: JSON.parse(row.forbidden) as string[],
  budget: BigInt(row.budget),
  maxPerPurchase: BigInt(row.max_per_purchase),
  plannedPurchases: row.planned_purchases,
  taskId: row.task_id,
  createdAt: row.created_at,
  expiresAt: row.expires_at,
  decidedAt: row.decided_at,
});

export function createIntentRepository(db: Db): IntentRepository {
  const insert = db.prepare(
    `INSERT INTO intents (id, user_id, api_key_id, status, purpose, task, allowed_purchases,
       forbidden, budget, max_per_purchase, planned_purchases, task_id, created_at, expires_at,
       decided_at)
     VALUES (@id, @userId, @apiKeyId, @status, @purpose, @task, @allowedPurchases, @forbidden,
       @budget, @maxPerPurchase, @plannedPurchases, @taskId, @createdAt, @expiresAt, @decidedAt)`,
  );
  const byId = db.prepare<[string], IntentRow>('SELECT * FROM intents WHERE id = ?');
  const byUser = db.prepare<[string], IntentRow>(
    'SELECT * FROM intents WHERE user_id = ? ORDER BY created_at DESC',
  );
  const byUserAndStatus = db.prepare<[string, string], IntentRow>(
    'SELECT * FROM intents WHERE user_id = ? AND status = ? ORDER BY created_at DESC',
  );
  const decide = db.prepare(
    `UPDATE intents SET status = ?, decided_at = ?, task_id = ?
     WHERE id = ? AND status = 'pending_approval'`,
  );
  const expireStale = db.prepare(
    `UPDATE intents SET status = 'expired', decided_at = expires_at
     WHERE status = 'pending_approval' AND expires_at <= ?`,
  );
  const expireByKey = db.prepare(
    `UPDATE intents SET status = 'expired', decided_at = ?
     WHERE api_key_id = ? AND status = 'pending_approval'`,
  );

  const one = (row: IntentRow | undefined) => row && toRecord(row);

  return {
    insert: (intent) =>
      void insert.run({
        ...intent,
        allowedPurchases: JSON.stringify(intent.allowedPurchases),
        forbidden: JSON.stringify(intent.forbidden),
        budget: intent.budget.toString(),
        maxPerPurchase: intent.maxPerPurchase.toString(),
      }),
    findById: (id) => one(byId.get(id)),
    listByUser: (userId, status) =>
      (status ? byUserAndStatus.all(userId, status) : byUser.all(userId)).map(toRecord),
    findPendingByUser: (userId) => one(byUserAndStatus.get(userId, 'pending_approval')),
    decide: (id, to, decidedAt, taskId) => decide.run(to, decidedAt, taskId, id).changes === 1,
    expireStale: (now) => void expireStale.run(now),
    expirePendingByApiKey: (apiKeyId, at) => void expireByKey.run(at, apiKeyId),
  };
}
