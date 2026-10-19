import type { OperationId, TaskId, UserId } from '@semanticauth/contracts';
import type {
  Balance,
  LedgerEntryState,
  ReservationCheck,
  ReservationCheckInput,
  ReservationRejectReason,
} from '../../domain/ledger';
import type { Db } from './db';

export interface LedgerEntryRecord {
  operationId: OperationId;
  userId: UserId;
  taskId: TaskId;
  amount: bigint;
  state: LedgerEntryState;
  createdAt: string;
  updatedAt: string;
}

export interface LedgerBalances {
  task: Balance;
  user: Balance;
  pool: Balance;
}

export interface ReserveInput {
  operationId: OperationId;
  userId: UserId;
  taskId: TaskId;
  amount: bigint;
  /** Total the sponsor pool may hand out, from config. */
  poolLimit: bigint;
  at: string;
}

export type ReserveResult =
  | { ok: true; entry: LedgerEntryRecord; created: boolean }
  | { ok: false; reason: ReservationRejectReason; balances: LedgerBalances };

export interface LedgerRepository {
  /**
   * Atomically reads the task, user and pool balances, asks `check` (pass the domain's
   * `checkReservation`) and inserts a `reserved` entry if it fits. Repeating the same
   * operation returns its existing entry instead of reserving twice.
   */
  reserve(
    input: ReserveInput,
    check: (input: ReservationCheckInput) => ReservationCheck,
  ): ReserveResult;
  /** reserved → spent; call it when the authorization is persisted as `issued`. */
  markSpent(operationId: OperationId, at: string): boolean;
  /** reserved → released; the operation ended before anything was signed. */
  release(operationId: OperationId, at: string): boolean;
  /** spent → released; only reconciliation, once it proves the payment never settled. */
  reverseSpent(operationId: OperationId, at: string): boolean;
  findByOperation(operationId: OperationId): LedgerEntryRecord | undefined;
  taskBalance(taskId: TaskId): Balance;
  userBalance(userId: UserId): Balance;
  poolBalance(poolLimit: bigint): Balance;
  /** Spent plus reserved by the user in entries created at or after `since` (daily limit). */
  usedSince(userId: UserId, since: string): bigint;
}

interface LedgerRow {
  operation_id: string;
  user_id: string;
  task_id: string;
  amount: string;
  state: LedgerEntryState;
  created_at: string;
  updated_at: string;
}

interface SumRow {
  state: LedgerEntryState;
  total: bigint;
}

const toRecord = (row: LedgerRow): LedgerEntryRecord => ({
  operationId: row.operation_id,
  userId: row.user_id,
  taskId: row.task_id,
  amount: BigInt(row.amount),
  state: row.state,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const fromSums = (limit: bigint, rows: SumRow[]): Balance => ({
  limit,
  spent: rows.find((row) => row.state === 'spent')?.total ?? 0n,
  reserved: rows.find((row) => row.state === 'reserved')?.total ?? 0n,
});

// Amounts are TEXT; CAST keeps SUM exact as long as totals fit in 64 bits (they do for USDC).
const SUM = `SELECT state, SUM(CAST(amount AS INTEGER)) AS total FROM ledger_entries`;
const COUNTED = `state IN ('reserved', 'spent')`;

export function createLedgerRepository(db: Db): LedgerRepository {
  const insert = db.prepare(
    `INSERT INTO ledger_entries (operation_id, user_id, task_id, amount, state, created_at,
       updated_at)
     VALUES (?, ?, ?, ?, 'reserved', ?, ?)`,
  );
  const findByOperation = db.prepare<[string], LedgerRow>(
    'SELECT * FROM ledger_entries WHERE operation_id = ?',
  );
  const transition = db.prepare(
    'UPDATE ledger_entries SET state = ?, updated_at = ? WHERE operation_id = ? AND state = ?',
  );
  const sumByTask = db
    .prepare<[string], SumRow>(`${SUM} WHERE task_id = ? AND ${COUNTED} GROUP BY state`)
    .safeIntegers(true);
  const sumByUser = db
    .prepare<[string], SumRow>(`${SUM} WHERE user_id = ? AND ${COUNTED} GROUP BY state`)
    .safeIntegers(true);
  const sumPool = db
    .prepare<[], SumRow>(`${SUM} WHERE ${COUNTED} GROUP BY state`)
    .safeIntegers(true);
  const usedSince = db
    .prepare<[string, string], bigint | null>(
      `SELECT SUM(CAST(amount AS INTEGER)) FROM ledger_entries
       WHERE user_id = ? AND created_at >= ? AND ${COUNTED}`,
    )
    .pluck()
    .safeIntegers(true);
  const taskRow = db.prepare<[string], { user_id: string; budget: string }>(
    'SELECT user_id, budget FROM tasks WHERE id = ?',
  );
  const allocation = db
    .prepare<[string], string>('SELECT amount FROM allocations WHERE user_id = ?')
    .pluck();

  const taskBalance = (taskId: TaskId): Balance => {
    const task = taskRow.get(taskId);
    if (!task) throw new Error(`ledger: unknown task ${taskId}`);
    return fromSums(BigInt(task.budget), sumByTask.all(taskId));
  };
  const userBalance = (userId: UserId): Balance => {
    const amount = allocation.get(userId);
    // No allocation row means the user may not spend anything.
    return fromSums(amount === undefined ? 0n : BigInt(amount), sumByUser.all(userId));
  };
  const poolBalance = (poolLimit: bigint): Balance => fromSums(poolLimit, sumPool.all());

  const move = (from: LedgerEntryState, to: LedgerEntryState) => (id: OperationId, at: string) =>
    transition.run(to, at, id, from).changes === 1;

  const reserve = db.transaction(
    (input: ReserveInput, check: (i: ReservationCheckInput) => ReservationCheck): ReserveResult => {
      const existing = findByOperation.get(input.operationId);
      if (existing) return { ok: true, entry: toRecord(existing), created: false };

      const task = taskRow.get(input.taskId);
      if (!task) throw new Error(`ledger: unknown task ${input.taskId}`);
      if (task.user_id !== input.userId) {
        throw new Error(`ledger: task ${input.taskId} does not belong to ${input.userId}`);
      }

      const balances: LedgerBalances = {
        task: taskBalance(input.taskId),
        user: userBalance(input.userId),
        pool: poolBalance(input.poolLimit),
      };
      const decision = check({ amount: input.amount, ...balances });
      if (!decision.ok) return { ok: false, reason: decision.reason, balances };

      insert.run(
        input.operationId,
        input.userId,
        input.taskId,
        input.amount.toString(),
        input.at,
        input.at,
      );
      return { ok: true, entry: toRecord(findByOperation.get(input.operationId)!), created: true };
    },
  );

  return {
    // IMMEDIATE takes the write lock before reading, so two processes can't both pass the check.
    reserve: (input, check) => reserve.immediate(input, check),
    markSpent: move('reserved', 'spent'),
    release: move('reserved', 'released'),
    reverseSpent: move('spent', 'released'),
    findByOperation: (id) => {
      const row = findByOperation.get(id);
      return row ? toRecord(row) : undefined;
    },
    taskBalance,
    userBalance,
    poolBalance,
    usedSince: (userId, since) => usedSince.get(userId, since) ?? 0n,
  };
}
