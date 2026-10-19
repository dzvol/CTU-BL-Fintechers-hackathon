import { describe, expect, it } from 'vitest';
import { canTransition, failureState, isTerminal } from './state-machine';

describe('operation state machine', () => {
  it('follows the happy path and the free-content shortcut', () => {
    const path = [
      'requested',
      'reserved',
      'prepared',
      'issued',
      'submitted',
      'settled',
      'delivered',
    ] as const;
    for (let i = 1; i < path.length; i++) expect(canTransition(path[i - 1]!, path[i]!)).toBe(true);
    expect(canTransition('requested', 'delivered')).toBe(true);
  });

  it('never goes back to blocked once the authorization was issued', () => {
    expect(canTransition('issued', 'blocked')).toBe(false);
    expect(canTransition('submitted', 'blocked')).toBe(false);
  });

  it('maps failures to blocked before issuing and unknown after', () => {
    expect(failureState('requested')).toBe('blocked');
    expect(failureState('prepared')).toBe('blocked');
    expect(failureState('awaiting_review')).toBe('closed');
    expect(failureState('issued')).toBe('unknown');
    expect(failureState('submitted')).toBe('unknown');
    expect(failureState('delivered')).toBeUndefined();
  });

  it('has terminal states', () => {
    expect(
      ['blocked', 'closed', 'delivered', 'delivery_failed'].every((s) => isTerminal(s as never)),
    ).toBe(true);
    expect(isTerminal('unknown')).toBe(false);
  });
});
