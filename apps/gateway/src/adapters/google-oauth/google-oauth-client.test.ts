import { describe, expect, it } from 'vitest';
import { parseIdToken } from './google-oauth-client';

const CLIENT_ID = 'client-123.apps.googleusercontent.com';
const NOW = new Date('2026-10-19T12:00:00Z');

function token(claims: Record<string, unknown>): string {
  const payload = Buffer.from(
    JSON.stringify({
      iss: 'https://accounts.google.com',
      aud: CLIENT_ID,
      sub: '1234',
      exp: NOW.getTime() / 1000 + 3600,
      email: 'alice@example.com',
      email_verified: true,
      ...claims,
    }),
  ).toString('base64url');
  return `header.${payload}.signature`;
}

describe('parseIdToken', () => {
  it('returns the identity for valid claims', () => {
    expect(parseIdToken(token({ name: 'Alice' }), CLIENT_ID, NOW)).toEqual({
      googleSub: '1234',
      email: 'alice@example.com',
      name: 'Alice',
      picture: undefined,
    });
  });

  it.each([
    ['foreign audience', { aud: 'someone-else' }],
    ['foreign issuer', { iss: 'https://evil.example' }],
    ['expired token', { exp: NOW.getTime() / 1000 - 1 }],
    ['unverified email', { email_verified: false }],
  ])('rejects %s', (_, claims) => {
    expect(() => parseIdToken(token(claims), CLIENT_ID, NOW)).toThrow();
  });
});
