import { describe, expect, it } from 'vitest';
import {
  canTransition,
  checkReservation,
  remaining,
  sumEntries,
  toVerdictReason,
  type Balance,
} from './ledger';

const balance = (limit: bigint, spent = 0n, reserved = 0n): Balance => ({ limit, spent, reserved });
const roomy = balance(10_000_000n);

describe('remaining', () => {
  it('subtracts spent and reserved', () => {
    expect(remaining(balance(2_000_000n, 500_000n, 250_000n))).toBe(1_250_000n);
  });

  it('never goes below zero', () => {
    expect(remaining(balance(1_000_000n, 900_000n, 300_000n))).toBe(0n);
  });
});

describe('checkReservation', () => {
  it('allows an amount that fits every limit, including an exact fit', () => {
    expect(checkReservation({ amount: 10_000n, task: roomy, user: roomy, pool: roomy })).toEqual({
      ok: true,
    });
    expect(
      checkReservation({
        amount: 100_000n,
        task: balance(100_000n),
        user: roomy,
        pool: roomy,
      }),
    ).toEqual({ ok: true });
  });

  it.each([0n, -1n])('rejects a non-positive amount %s', (amount) => {
    expect(checkReservation({ amount, task: roomy, user: roomy, pool: roomy })).toEqual({
      ok: false,
      reason: 'invalid_amount',
    });
  });

  it('rejects when the task budget is used up by spending and reservations', () => {
    const task = balance(100_000n, 60_000n, 30_000n);
    expect(checkReservation({ amount: 20_000n, task, user: roomy, pool: roomy })).toEqual({
      ok: false,
      reason: 'task_budget_exceeded',
    });
  });

  it('rejects when the user allocation is insufficient', () => {
    const user = balance(2_000_000n, 1_995_000n);
    expect(checkReservation({ amount: 10_000n, task: roomy, user, pool: roomy })).toEqual({
      ok: false,
      reason: 'insufficient_allocation',
    });
  });

  it('rejects when the sponsor pool is exhausted', () => {
    const pool = balance(20_000_000n, 19_990_000n, 5_000n);
    expect(checkReservation({ amount: 10_000n, task: roomy, user: roomy, pool })).toEqual({
      ok: false,
      reason: 'sponsor_pool_exhausted',
    });
  });

  it('reports the narrowest limit first when several are exceeded', () => {
    const empty = balance(0n);
    expect(checkReservation({ amount: 1n, task: empty, user: empty, pool: empty })).toEqual({
      ok: false,
      reason: 'task_budget_exceeded',
    });
  });
});

describe('canTransition', () => {
  it.each([
    ['reserved', 'spent', true],
    ['reserved', 'released', true],
    ['spent', 'released', true],
    ['spent', 'reserved', false],
    ['released', 'reserved', false],
    ['released', 'spent', false],
    ['reserved', 'reserved', false],
  ] as const)('%s → %s is %s', (from, to, allowed) => {
    expect(canTransition(from, to)).toBe(allowed);
  });
});

describe('toVerdictReason', () => {
  it('keeps insufficient_allocation and maps the other limits to policy_limit_exceeded', () => {
    expect(toVerdictReason('insufficient_allocation')).toBe('insufficient_allocation');
    expect(toVerdictReason('task_budget_exceeded')).toBe('policy_limit_exceeded');
    expect(toVerdictReason('sponsor_pool_exhausted')).toBe('policy_limit_exceeded');
    expect(toVerdictReason('invalid_amount')).toBe('policy_limit_exceeded');
  });
});

describe('sumEntries', () => {
  it('counts spent and reserved and ignores released', () => {
    expect(
      sumEntries([
        { state: 'spent', amount: 10_000n },
        { state: 'spent', amount: 5_000n },
        { state: 'reserved', amount: 7_000n },
        { state: 'released', amount: 99_000n },
      ]),
    ).toEqual({ spent: 15_000n, reserved: 7_000n });
  });
});
