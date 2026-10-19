import { newId } from '@semanticauth/contracts';
import { describe, expect, it } from 'vitest';
import { checkReservation } from '../../domain/ledger';
import { openDatabase, type Db } from './db';
import { createLedgerRepository, type ReserveInput } from './ledger';

const AT = '2026-10-19T12:00:00.000Z';
const POOL = 20_000_000n; // 20 USDC

/** Inserts a user with an allocation and one active task, straight in SQL. */
function seedUser(db: Db, opts: { allocation?: bigint; taskBudget: bigint }) {
  const userId = newId('usr');
  const apiKeyId = newId('key');
  const intentId = newId('int');
  const taskId = newId('task');
  db.prepare(
    `INSERT INTO users (id, google_sub, email, created_at, last_login_at) VALUES (?, ?, ?, ?, ?)`,
  ).run(userId, userId, `${userId}@example.com`, AT, AT);
  if (opts.allocation !== undefined) {
    db.prepare('INSERT INTO allocations (user_id, amount, created_at) VALUES (?, ?, ?)').run(
      userId,
      opts.allocation.toString(),
      AT,
    );
  }
  db.prepare(
    `INSERT INTO api_keys (id, user_id, name, prefix, key_hash, created_at)
     VALUES (?, ?, 'test', 'sa_', ?, ?)`,
  ).run(apiKeyId, userId, apiKeyId, AT);
  db.prepare(
    `INSERT INTO intents (id, user_id, api_key_id, status, purpose, task, allowed_purchases,
       forbidden, budget, max_per_purchase, planned_purchases, task_id, created_at, expires_at)
     VALUES (?, ?, ?, 'approved', 'p', 't', '[]', '[]', ?, ?, 1, ?, ?, ?)`,
  ).run(intentId, userId, apiKeyId, opts.taskBudget.toString(), '1', taskId, AT, AT);
  db.prepare(
    `INSERT INTO tasks (id, intent_id, user_id, api_key_id, status, budget, created_at, expires_at)
     VALUES (?, ?, ?, ?, 'active', ?, ?, ?)`,
  ).run(taskId, intentId, userId, apiKeyId, opts.taskBudget.toString(), AT, AT);
  return { userId, taskId };
}

function setup() {
  const db = openDatabase(':memory:');
  return { db, ledger: createLedgerRepository(db) };
}

const reserveInput = (
  ids: { userId: string; taskId: string },
  amount: bigint,
  overrides: Partial<ReserveInput> = {},
): ReserveInput => ({
  operationId: newId('op'),
  userId: ids.userId,
  taskId: ids.taskId,
  amount,
  poolLimit: POOL,
  at: AT,
  ...overrides,
});

describe('LedgerRepository.reserve', () => {
  it('reserves funds and counts them against task, user and pool', () => {
    const { db, ledger } = setup();
    const ids = seedUser(db, { allocation: 2_000_000n, taskBudget: 1_000_000n });

    const result = ledger.reserve(reserveInput(ids, 10_000n), checkReservation);

    expect(result).toMatchObject({ ok: true, created: true, entry: { state: 'reserved' } });
    expect(ledger.taskBalance(ids.taskId)).toEqual({
      limit: 1_000_000n,
      spent: 0n,
      reserved: 10_000n,
    });
    expect(ledger.userBalance(ids.userId).reserved).toBe(10_000n);
    expect(ledger.poolBalance(POOL)).toEqual({ limit: POOL, spent: 0n, reserved: 10_000n });
  });

  it('returns the existing entry for a repeated operation instead of reserving twice', () => {
    const { db, ledger } = setup();
    const ids = seedUser(db, { allocation: 2_000_000n, taskBudget: 1_000_000n });
    const input = reserveInput(ids, 10_000n);

    ledger.reserve(input, checkReservation);
    const again = ledger.reserve(input, checkReservation);

    expect(again).toMatchObject({ ok: true, created: false });
    expect(ledger.taskBalance(ids.taskId).reserved).toBe(10_000n);
  });

  it('blocks a reservation above the remaining task budget and records nothing', () => {
    const { db, ledger } = setup();
    const ids = seedUser(db, { allocation: 2_000_000n, taskBudget: 15_000n });
    ledger.reserve(reserveInput(ids, 10_000n), checkReservation);

    const input = reserveInput(ids, 10_000n);
    const result = ledger.reserve(input, checkReservation);

    expect(result).toMatchObject({ ok: false, reason: 'task_budget_exceeded' });
    expect(ledger.findByOperation(input.operationId)).toBeUndefined();
  });

  it('blocks a user without an allocation', () => {
    const { db, ledger } = setup();
    const ids = seedUser(db, { taskBudget: 1_000_000n });

    expect(ledger.reserve(reserveInput(ids, 10_000n), checkReservation)).toMatchObject({
      ok: false,
      reason: 'insufficient_allocation',
    });
  });

  it('counts spending across all tasks of a user against the allocation', () => {
    const { db, ledger } = setup();
    const first = seedUser(db, { allocation: 50_000n, taskBudget: 1_000_000n });
    const op = reserveInput(first, 40_000n);
    ledger.reserve(op, checkReservation);
    ledger.markSpent(op.operationId, AT);

    // Same user, second task (the first one is treated as finished for this test).
    db.prepare(`UPDATE tasks SET status = 'closed' WHERE id = ?`).run(first.taskId);
    const intentId = newId('int');
    const taskId = newId('task');
    const apiKeyId = db
      .prepare<[string], string>('SELECT id FROM api_keys WHERE user_id = ?')
      .pluck()
      .get(first.userId)!;
    db.prepare(
      `INSERT INTO intents (id, user_id, api_key_id, status, purpose, task, allowed_purchases,
         forbidden, budget, max_per_purchase, planned_purchases, task_id, created_at, expires_at)
       VALUES (?, ?, ?, 'approved', 'p', 't', '[]', '[]', '1000000', '1', 1, ?, ?, ?)`,
    ).run(intentId, first.userId, apiKeyId, taskId, AT, AT);
    db.prepare(
      `INSERT INTO tasks (id, intent_id, user_id, api_key_id, status, budget, created_at,
         expires_at) VALUES (?, ?, ?, ?, 'active', '1000000', ?, ?)`,
    ).run(taskId, intentId, first.userId, apiKeyId, AT, AT);

    const result = ledger.reserve(
      reserveInput({ userId: first.userId, taskId }, 20_000n),
      checkReservation,
    );
    expect(result).toMatchObject({ ok: false, reason: 'insufficient_allocation' });
  });

  it('keeps two users together within the sponsor pool', () => {
    const { db, ledger } = setup();
    const alice = seedUser(db, { allocation: 2_000_000n, taskBudget: 2_000_000n });
    const bob = seedUser(db, { allocation: 2_000_000n, taskBudget: 2_000_000n });
    const pool = 1_500_000n;

    expect(
      ledger.reserve(reserveInput(alice, 1_000_000n, { poolLimit: pool }), checkReservation).ok,
    ).toBe(true);
    expect(
      ledger.reserve(reserveInput(bob, 1_000_000n, { poolLimit: pool }), checkReservation),
    ).toMatchObject({ ok: false, reason: 'sponsor_pool_exhausted' });
  });

  it('refuses a task that belongs to another user', () => {
    const { db, ledger } = setup();
    const alice = seedUser(db, { allocation: 2_000_000n, taskBudget: 1_000_000n });
    const bob = seedUser(db, { allocation: 2_000_000n, taskBudget: 1_000_000n });

    expect(() =>
      ledger.reserve(
        reserveInput({ userId: bob.userId, taskId: alice.taskId }, 10_000n),
        checkReservation,
      ),
    ).toThrow(/does not belong/);
  });
});

describe('LedgerRepository transitions', () => {
  it('moves reserved → spent and keeps counting the amount', () => {
    const { db, ledger } = setup();
    const ids = seedUser(db, { allocation: 2_000_000n, taskBudget: 1_000_000n });
    const input = reserveInput(ids, 10_000n);
    ledger.reserve(input, checkReservation);

    expect(ledger.markSpent(input.operationId, AT)).toBe(true);
    expect(ledger.markSpent(input.operationId, AT)).toBe(false);
    expect(ledger.userBalance(ids.userId)).toEqual({
      limit: 2_000_000n,
      spent: 10_000n,
      reserved: 0n,
    });
  });

  it('releases an unsigned reservation and frees the funds', () => {
    const { db, ledger } = setup();
    const ids = seedUser(db, { allocation: 2_000_000n, taskBudget: 1_000_000n });
    const input = reserveInput(ids, 10_000n);
    ledger.reserve(input, checkReservation);

    expect(ledger.release(input.operationId, AT)).toBe(true);
    expect(ledger.taskBalance(ids.taskId)).toEqual({ limit: 1_000_000n, spent: 0n, reserved: 0n });
    // Released can't be spent anymore.
    expect(ledger.markSpent(input.operationId, AT)).toBe(false);
  });

  it('only reverses spending that is actually spent', () => {
    const { db, ledger } = setup();
    const ids = seedUser(db, { allocation: 2_000_000n, taskBudget: 1_000_000n });
    const input = reserveInput(ids, 10_000n);
    ledger.reserve(input, checkReservation);

    expect(ledger.reverseSpent(input.operationId, AT)).toBe(false);
    ledger.markSpent(input.operationId, AT);
    expect(ledger.reverseSpent(input.operationId, AT)).toBe(true);
    expect(ledger.poolBalance(POOL).spent).toBe(0n);
  });
});

describe('LedgerRepository.usedSince', () => {
  it('sums spent and reserved since a point in time, ignoring released and older entries', () => {
    const { db, ledger } = setup();
    const ids = seedUser(db, { allocation: 2_000_000n, taskBudget: 1_000_000n });
    const old = reserveInput(ids, 1_000n, { at: '2026-10-18T10:00:00.000Z' });
    const spent = reserveInput(ids, 2_000n);
    const reserved = reserveInput(ids, 3_000n);
    const released = reserveInput(ids, 4_000n);
    for (const input of [old, spent, reserved, released]) ledger.reserve(input, checkReservation);
    ledger.markSpent(spent.operationId, AT);
    ledger.release(released.operationId, AT);

    expect(ledger.usedSince(ids.userId, '2026-10-19T00:00:00.000Z')).toBe(5_000n);
    expect(ledger.usedSince(newId('usr'), '2026-10-19T00:00:00.000Z')).toBe(0n);
  });
});
