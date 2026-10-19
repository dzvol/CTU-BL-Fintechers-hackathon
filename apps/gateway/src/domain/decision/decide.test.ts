import { describe, expect, it } from 'vitest';
import { decide, type ScreenSignal } from './decide';

const ok = { ok: true } as const;
const screen = (...signals: ScreenSignal[]) => ({ signals });
const fits = { fitsIntent: true };

describe('decision table', () => {
  it('blocks on policy without needing Jev', () => {
    expect(decide({ policy: { ok: false, reason: 'policy_limit_exceeded' } })).toEqual({
      verdict: 'BLOCK',
      reason: 'policy_limit_exceeded',
    });
  });

  it('fails closed when a semantic check is missing', () => {
    expect(decide({ policy: ok, screen: screen() })).toMatchObject({
      verdict: 'BLOCK',
      reason: 'jev_unavailable',
    });
    expect(decide({ policy: ok, judge: fits })).toMatchObject({
      verdict: 'BLOCK',
      reason: 'jev_unavailable',
    });
  });

  it.each([
    [screen('prompt_injection'), fits, 'BLOCK', 'prompt_injection'],
    [screen('prompt_injection', 'subscription'), fits, 'BLOCK', 'prompt_injection'],
    [screen(), { fitsIntent: false }, 'BLOCK', 'off_intent'],
    [screen('recipient_change'), { fitsIntent: false }, 'BLOCK', 'off_intent'],
    [screen('recipient_change'), fits, 'REVIEW', 'recipient_change'],
    [screen('subscription'), fits, 'REVIEW', 'subscription'],
    [screen('suspicious_offer'), fits, 'REVIEW', 'suspicious_offer'],
    [screen(), fits, 'ALLOW', 'within_intent'],
  ] as const)('%j + %j → %s (%s)', (s, judge, verdict, reason) => {
    expect(decide({ policy: ok, screen: s, judge })).toEqual({ verdict, reason });
  });
});
