import { describe, it, expect } from 'vitest';
import { outcome, path, shortHex, taskStatus } from './labels';
import { countdown, fromNow } from './time';
import { operation } from '../test/fixtures';

const settlement = {
  txHash: `0x${'1'.repeat(64)}`,
  explorerUrl: 'https://sepolia.basescan.org/tx/example',
};

describe('operation outcome', () => {
  it('reports paid only with on-chain settlement, never from delivery alone', () => {
    expect(outcome({ ...operation, state: 'delivered' }).text).toBe('Delivered');
    expect(outcome({ ...operation, state: 'delivered', settlement }).text).toBe('Paid');
    expect(outcome({ ...operation, state: 'delivery_failed', settlement }).text).toBe(
      'Paid, not delivered',
    );
  });
  it('flags unconfirmed payments and separates free content', () => {
    expect(outcome({ ...operation, state: 'unknown' })).toMatchObject({
      text: 'Unconfirmed',
      tone: 'warning',
    });
    expect(
      outcome({ ...operation, state: 'delivered', reason: 'free_content', offer: undefined }).text,
    ).toBe('Free');
  });
  it('names every state', () => {
    for (const state of [
      'requested',
      'blocked',
      'awaiting_review',
      'reserved',
      'prepared',
      'issued',
      'submitted',
      'unknown',
      'settled',
      'delivered',
      'delivery_failed',
      'closed',
    ] as const) {
      expect(outcome({ ...operation, state }).text).not.toBe('');
    }
  });
});

describe('task status', () => {
  it('prefers the task state once the intent was approved', () => {
    expect(taskStatus('approved', 'active').text).toBe('Active');
    expect(taskStatus('approved', 'closed').text).toBe('Stopped');
    expect(taskStatus('pending_approval').text).toBe('Needs you');
  });
});

describe('formatting', () => {
  it('shortens addresses and drops a bare slash path', () => {
    expect(shortHex('0x1111111111111111111111111111111111112222')).toBe('0x1111…2222');
    expect(path('https://a.test/')).toBe('');
    expect(path('https://a.test/x?y=1')).toBe('/x?y=1');
  });
  it('counts down to a deadline and stops at zero', () => {
    const now = Date.parse('2026-10-19T12:00:00Z');
    expect(countdown('2026-10-19T12:04:05Z', now)).toBe('4:05');
    expect(countdown('2026-10-19T13:30:00Z', now)).toBe('1 h 30 min');
    expect(countdown('2026-10-19T11:59:59Z', now)).toBeUndefined();
    expect(fromNow('2026-10-19T11:55:00Z', now)).toBe('5 min. ago');
  });
});
