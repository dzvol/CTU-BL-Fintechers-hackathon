import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { isWellFormedApiKey, maskApiKey } from './api-key';

// Same shape the gateway issues.
const key = `sa_${randomBytes(32).toString('base64url')}`;

describe('API key helpers', () => {
  it('accepts gateway-issued keys and rejects obvious typos', () => {
    expect(isWellFormedApiKey(key)).toBe(true);
    expect(isWellFormedApiKey('hello')).toBe(false);
    expect(isWellFormedApiKey(`${key} `)).toBe(false);
    expect(isWellFormedApiKey('sa_short')).toBe(false);
  });

  it('masks the key to the prefix the dashboard shows', () => {
    const masked = maskApiKey(key);
    expect(masked).toBe(`${key.slice(0, 10)}…`);
    expect(masked).not.toContain(key.slice(10));
  });
});
