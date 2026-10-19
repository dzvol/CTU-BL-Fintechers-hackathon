import { describe, it, expect } from 'vitest';
import { paymentLabel, deliveryLabel } from './operation-display';
import { operation } from '../test/fixtures';
describe('operation evidence display', () => {
  it('keeps unknown payments counted as spent and separates failed delivery', () => {
    expect(paymentLabel(operation)).toContain('counts as spent');
    expect(paymentLabel({ ...operation, state: 'delivery_failed' })).toBe('Not reported');
    expect(deliveryLabel({ ...operation, state: 'delivery_failed' })).toBe('Delivery failed');
  });
  it('does not infer a paid purchase from delivery alone', () => {
    expect(paymentLabel({ ...operation, state: 'delivered' })).toBe('Not reported');
    expect(
      paymentLabel({ ...operation, state: 'delivered', reason: 'free_content', offer: undefined }),
    ).toBe('Free · no payment');
  });
  it('reports settlement evidence independently of delivery state', () => {
    expect(
      paymentLabel({
        ...operation,
        state: 'delivery_failed',
        settlement: {
          txHash: `0x${'1'.repeat(64)}`,
          explorerUrl: 'https://sepolia.basescan.org/tx/example',
        },
      }),
    ).toContain('Settled');
  });
});
