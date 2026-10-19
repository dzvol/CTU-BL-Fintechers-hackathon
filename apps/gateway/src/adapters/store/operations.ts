import type {
  NormalizedOffer,
  OperationId,
  OperationState,
  Settlement,
  TaskId,
  UserId,
  Verdict,
  VerdictReason,
} from '@semanticauth/contracts';
import type { Db } from './db';

export interface OperationRecord {
  id: OperationId;
  taskId: TaskId;
  userId: UserId;
  url: string;
  state: OperationState;
  verdict: Verdict | null;
  reason: VerdictReason | null;
  offer: NormalizedOffer | null;
  settlement: Settlement | null;
  message: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Fields a state transition may set alongside the new state. */
export type OperationPatch = Partial<
  Pick<OperationRecord, 'verdict' | 'reason' | 'offer' | 'settlement' | 'message'>
>;

export interface OperationRepository {
  insert(operation: OperationRecord): void;
  findById(id: OperationId): OperationRecord | undefined;
  findByTaskAndUrl(taskId: TaskId, url: string): OperationRecord | undefined;
  listByUser(userId: UserId, filter: { taskId?: TaskId }): OperationRecord[];
  /** Every operation in one of `states`, oldest first (recovery after a restart). */
  listByStates(states: readonly OperationState[]): OperationRecord[];
  /** Compare-and-set: moves `from` → `to`; false if the operation was no longer in `from`. */
  transition(
    id: OperationId,
    from: OperationState,
    to: OperationState,
    patch: OperationPatch,
    at: string,
  ): boolean;
}

interface OperationRow {
  id: string;
  task_id: string;
  user_id: string;
  url: string;
  state: OperationState;
  verdict: Verdict | null;
  reason: VerdictReason | null;
  offer: string | null;
  settlement: string | null;
  message: string | null;
  created_at: string;
  updated_at: string;
}

const json = <T>(value: string | null) => (value === null ? null : (JSON.parse(value) as T));

const toRecord = (row: OperationRow): OperationRecord => ({
  id: row.id,
  taskId: row.task_id,
  userId: row.user_id,
  url: row.url,
  state: row.state,
  verdict: row.verdict,
  reason: row.reason,
  offer: json<NormalizedOffer>(row.offer),
  settlement: json<Settlement>(row.settlement),
  message: row.message,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export function createOperationRepository(db: Db): OperationRepository {
  const insert = db.prepare(
    `INSERT INTO operations (id, task_id, user_id, url, state, verdict, reason, offer, settlement,
       message, created_at, updated_at)
     VALUES (@id, @taskId, @userId, @url, @state, @verdict, @reason, @offer, @settlement,
       @message, @createdAt, @updatedAt)`,
  );
  const byId = db.prepare<[string], OperationRow>('SELECT * FROM operations WHERE id = ?');
  const byTaskAndUrl = db.prepare<[string, string], OperationRow>(
    'SELECT * FROM operations WHERE task_id = ? AND url = ?',
  );
  const byUser = db.prepare<[string], OperationRow>(
    'SELECT * FROM operations WHERE user_id = ? ORDER BY created_at DESC',
  );
  const byUserAndTask = db.prepare<[string, string], OperationRow>(
    'SELECT * FROM operations WHERE user_id = ? AND task_id = ? ORDER BY created_at DESC',
  );
  const byStates = db.prepare<[string], OperationRow>(
    'SELECT * FROM operations WHERE state IN (SELECT value FROM json_each(?)) ORDER BY created_at',
  );
  // COALESCE keeps fields the patch doesn't set.
  const transition = db.prepare(
    `UPDATE operations SET
       state = @to,
       verdict = COALESCE(@verdict, verdict),
       reason = COALESCE(@reason, reason),
       offer = COALESCE(@offer, offer),
       settlement = COALESCE(@settlement, settlement),
       message = COALESCE(@message, message),
       updated_at = @at
     WHERE id = @id AND state = @from`,
  );

  const one = (row: OperationRow | undefined) => row && toRecord(row);
  const toJson = (value: unknown) => (value == null ? null : JSON.stringify(value));

  return {
    insert: (op) =>
      void insert.run({ ...op, offer: toJson(op.offer), settlement: toJson(op.settlement) }),
    findById: (id) => one(byId.get(id)),
    findByTaskAndUrl: (taskId, url) => one(byTaskAndUrl.get(taskId, url)),
    listByUser: (userId, { taskId }) =>
      (taskId ? byUserAndTask.all(userId, taskId) : byUser.all(userId)).map(toRecord),
    listByStates: (states) => byStates.all(JSON.stringify(states)).map(toRecord),
    transition: (id, from, to, patch, at) =>
      transition.run({
        id,
        from,
        to,
        at,
        verdict: patch.verdict ?? null,
        reason: patch.reason ?? null,
        offer: toJson(patch.offer),
        settlement: toJson(patch.settlement),
        message: patch.message ?? null,
      }).changes === 1,
  };
}
