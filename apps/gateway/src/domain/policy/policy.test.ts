import type { Intent, NormalizedOffer, Task, TaskId } from '@semanticauth/contracts';
import { describe, expect, it } from 'vitest';
import type { Purchase } from '../facts/facts';
import { defaultPolicy, type PolicyInput } from './policy';

const TASK = 'task_1' as TaskId;
const OTHER_TASK = 'task_0' as TaskId;
const PAY_TO = '0x1111111111111111111111111111111111111111';

const offer = (amount: string) => ({ amount, payTo: PAY_TO }) as NormalizedOffer;
const intent = { maxPerPurchase: '250000', plannedPurchases: 3 } as Intent;
const task = { id: TASK, budget: '1000000' } as Task;
const bought = (amount: bigint, taskId = TASK): Purchase => ({ taskId, payTo: PAY_TO, amount });

const check = (amount: string, purchases: Purchase[] = [], allocation = 2_000_000n) =>
  defaultPolicy({ offer: offer(amount), intent, task, purchases, allocation } as PolicyInput);

describe('Policy', () => {
  it('lets a purchase within all limits through', () => {
    expect(check('10000')).toEqual({ ok: true });
    expect(check('250000', [bought(500_000n)])).toEqual({ ok: true });
  });

  it('blocks a non-positive price', () => {
    expect(check('0')).toMatchObject({ ok: false, reason: 'policy_limit_exceeded' });
  });

  it('blocks a price over the max per purchase (scenario: price over limit)', () => {
    expect(check('5000000')).toEqual({
      ok: false,
      reason: 'policy_limit_exceeded',
      detail: '5.00 USDC is over the max per purchase of 0.25 USDC',
    });
  });

  it('blocks what no longer fits the task budget', () => {
    const outcome = check('250000', [
      bought(250_000n),
      bought(250_000n),
      bought(250_000n, OTHER_TASK),
    ]);
    expect(outcome).toEqual({ ok: true });
    expect(check('250000', [bought(500_000n), bought(300_000n)])).toMatchObject({
      ok: false,
      reason: 'policy_limit_exceeded',
      detail: expect.stringContaining('task budget (0.20 USDC of 1.00 USDC left)'),
    });
  });

  it('blocks more purchases than the intent planned', () => {
    expect(check('10000', [bought(10_000n), bought(10_000n), bought(10_000n)])).toMatchObject({
      ok: false,
      reason: 'policy_limit_exceeded',
      detail: 'the task already made all 3 planned purchases',
    });
  });

  it('blocks when the user allocation is used up (scenario: insufficient allocation)', () => {
    expect(check('100000', [bought(1_950_000n, OTHER_TASK)])).toMatchObject({
      ok: false,
      reason: 'insufficient_allocation',
      detail: expect.stringContaining('0.05 USDC left'),
    });
  });
});
