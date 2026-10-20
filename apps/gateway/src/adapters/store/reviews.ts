import type {
  NormalizedOffer,
  OperationId,
  PasskeyId,
  ReviewId,
  ReviewStatus,
  TaskId,
  UserId,
  VerdictReason,
} from '@semanticauth/contracts';
import type { Db } from './db';

export interface ReviewRecord {
  id: ReviewId;
  operationId: OperationId;
  userId: UserId;
  taskId: TaskId;
  status: ReviewStatus;
  reason: VerdictReason;
  offer: NormalizedOffer;
  detail: string;
  createdAt: string;
  expiresAt: string;
  decidedAt: string | null;
}

export interface ReviewRepository {
  insert(review: ReviewRecord): void;
  findById(id: ReviewId): ReviewRecord | undefined;
  findByOperation(operationId: OperationId): ReviewRecord | undefined;
  listByUser(userId: UserId, status?: ReviewStatus): ReviewRecord[];
  /**
   * pending → approved/rejected with a new deadline; false if it was no longer pending.
   * `passkeyId` is the passkey that confirmed an approval, if any.
   */
  decide(
    id: ReviewId,
    to: 'approved' | 'rejected',
    decidedAt: string,
    expiresAt: string,
    passkeyId?: PasskeyId | null,
  ): boolean;
  /** pending/approved → expired; false if it was in neither state anymore. */
  expire(id: ReviewId): boolean;
  /**
   * Open reviews whose operation still waits but can't go on: past the deadline, or the task
   * is no longer active (closed, expired, key revoked).
   */
  listStale(now: string): ReviewRecord[];
}

interface ReviewRow {
  id: string;
  operation_id: string;
  user_id: string;
  task_id: string;
  status: ReviewStatus;
  reason: VerdictReason;
  offer: string;
  detail: string;
  created_at: string;
  expires_at: string;
  decided_at: string | null;
}

const toRecord = (row: ReviewRow): ReviewRecord => ({
  id: row.id,
  operationId: row.operation_id,
  userId: row.user_id,
  taskId: row.task_id,
  status: row.status,
  reason: row.reason,
  offer: JSON.parse(row.offer) as NormalizedOffer,
  detail: row.detail,
  createdAt: row.created_at,
  expiresAt: row.expires_at,
  decidedAt: row.decided_at,
});

export function createReviewRepository(db: Db): ReviewRepository {
  const insert = db.prepare(
    `INSERT INTO reviews (id, operation_id, user_id, task_id, status, reason, offer, detail,
       created_at, expires_at, decided_at)
     VALUES (@id, @operationId, @userId, @taskId, @status, @reason, @offer, @detail,
       @createdAt, @expiresAt, @decidedAt)`,
  );
  const byId = db.prepare<[string], ReviewRow>('SELECT * FROM reviews WHERE id = ?');
  const byOperation = db.prepare<[string], ReviewRow>(
    'SELECT * FROM reviews WHERE operation_id = ?',
  );
  const byUser = db.prepare<[string], ReviewRow>(
    'SELECT * FROM reviews WHERE user_id = ? ORDER BY created_at DESC',
  );
  const byUserAndStatus = db.prepare<[string, string], ReviewRow>(
    'SELECT * FROM reviews WHERE user_id = ? AND status = ? ORDER BY created_at DESC',
  );
  const decide = db.prepare(
    `UPDATE reviews SET status = @to, decided_at = @decidedAt, expires_at = @expiresAt,
       approved_passkey_id = @passkeyId
     WHERE id = @id AND status = 'pending'`,
  );
  const expire = db.prepare(
    `UPDATE reviews SET status = 'expired' WHERE id = ? AND status IN ('pending', 'approved')`,
  );
  const stale = db.prepare<{ now: string }, ReviewRow>(
    `SELECT r.* FROM reviews r
       JOIN operations o ON o.id = r.operation_id
       JOIN tasks t ON t.id = r.task_id
     WHERE r.status IN ('pending', 'approved')
       AND o.state = 'awaiting_review'
       AND (r.expires_at <= @now OR t.status <> 'active' OR t.expires_at <= @now)`,
  );

  const one = (row: ReviewRow | undefined) => row && toRecord(row);

  return {
    insert: (review) => void insert.run({ ...review, offer: JSON.stringify(review.offer) }),
    findById: (id) => one(byId.get(id)),
    findByOperation: (operationId) => one(byOperation.get(operationId)),
    listByUser: (userId, status) =>
      (status ? byUserAndStatus.all(userId, status) : byUser.all(userId)).map(toRecord),
    decide: (id, to, decidedAt, expiresAt, passkeyId = null) =>
      decide.run({ id, to, decidedAt, expiresAt, passkeyId }).changes === 1,
    expire: (id) => expire.run(id).changes === 1,
    listStale: (now) => stale.all({ now }).map(toRecord),
  };
}
