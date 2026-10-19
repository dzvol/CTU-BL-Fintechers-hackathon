import { describe, expect, it } from 'vitest';
import { formatUsdc, parseUsdc } from './money';

describe('parseUsdc', () => {
  it('converts human USDC to atomic units', () => {
    expect(parseUsdc('0.10')).toBe(100000n);
    expect(parseUsdc('2')).toBe(2000000n);
    expect(parseUsdc('1.234567')).toBe(1234567n);
  });

  it('rejects more than 6 decimals, negatives and garbage', () => {
    expect(() => parseUsdc('0.0000001')).toThrow();
    expect(() => parseUsdc('-1')).toThrow();
    expect(() => parseUsdc('1e3')).toThrow();
  });
});

describe('formatUsdc', () => {
  it('formats atomic units for display', () => {
    expect(formatUsdc(100000n)).toBe('0.10');
    expect(formatUsdc('2000000')).toBe('2.00');
    expect(formatUsdc(1234567n)).toBe('1.234567');
  });

  it('round-trips with parseUsdc', () => {
    expect(parseUsdc(formatUsdc(1234567n))).toBe(1234567n);
  });
});
