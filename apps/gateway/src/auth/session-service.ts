import { createHash, randomBytes } from 'node:crypto';
import type { UserId } from '@semanticauth/contracts';
import type { SessionRepository } from '../adapters/store';

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface SessionService {
  create(userId: UserId): { token: string; expiresAt: Date };
  /** The session's user and when they logged in, if the session is still valid. */
  resolve(token: string): { userId: UserId; createdAt: string } | undefined;
  revoke(token: string): void;
}

// Only the hash is stored, so a leaked database doesn't yield usable session cookies.
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export function createSessionService(deps: {
  sessions: SessionRepository;
  ttlMs?: number;
  now?: () => Date;
}): SessionService {
  const now = deps.now ?? (() => new Date());
  const ttlMs = deps.ttlMs ?? SESSION_TTL_MS;

  return {
    create(userId) {
      const token = randomBytes(32).toString('base64url');
      const createdAt = now();
      const expiresAt = new Date(createdAt.getTime() + ttlMs);
      deps.sessions.insert({
        tokenHash: hashToken(token),
        userId,
        createdAt: createdAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
      });
      return { token, expiresAt };
    },
    resolve: (token) => deps.sessions.findActive(hashToken(token), now().toISOString()),
    revoke: (token) => deps.sessions.delete(hashToken(token)),
  };
}
