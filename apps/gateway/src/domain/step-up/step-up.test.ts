import { describe, expect, it } from 'vitest';
import { canonicalJson, deriveChallenge, type StepUpFacts } from './step-up';

const review: StepUpFacts = {
  type: 'approve_review',
  reviewId: 'rev_00000000-0000-4000-8000-000000000001',
  operationId: 'op_00000000-0000-4000-8000-000000000001',
  url: 'https://merchant.test/paid',
  amount: '10000',
  asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  network: 'base-sepolia',
  payTo: '0x1111111111111111111111111111111111111111',
};

describe('canonicalJson', () => {
  it('does not depend on key order, at any depth', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: [{ y: 1, x: 2 }] } })).toBe(
      canonicalJson({ a: { c: [{ x: 2, y: 1 }], d: 2 }, b: 1 }),
    );
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  it('drops undefined fields like JSON does', () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}');
  });
});

describe('deriveChallenge', () => {
  const action = canonicalJson(review);

  it('is deterministic for the same nonce and action', () => {
    expect(deriveChallenge('n1', action)).toBe(deriveChallenge('n1', action));
    expect(deriveChallenge('n1', action)).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('changes with the nonce', () => {
    expect(deriveChallenge('n1', action)).not.toBe(deriveChallenge('n2', action));
  });

  it.each([
    ['amount', { amount: '10001' }],
    ['recipient', { payTo: '0x2222222222222222222222222222222222222222' }],
    ['review', { reviewId: 'rev_00000000-0000-4000-8000-000000000002' }],
    ['url', { url: 'https://merchant.test/other' }],
  ])('changes when the %s changes', (_, change) => {
    const changed = canonicalJson({ ...review, ...change });
    expect(deriveChallenge('n1', changed)).not.toBe(deriveChallenge('n1', action));
  });
});
