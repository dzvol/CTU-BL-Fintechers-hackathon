import type { UserId } from '@semanticauth/contracts';
import type { Db } from './db';

export interface SessionRecord {
  tokenHash: string;
  userId: UserId;
  createdAt: string;
  expiresAt: string;
}

export interface SessionRepository {
  insert(session: SessionRecord): void;
  /** A session that hasn't expired at `now` (ISO timestamp). */
  findActive(tokenHash: string, now: string): { userId: UserId; createdAt: string } | undefined;
  delete(tokenHash: string): void;
}

export function createSessionRepository(db: Db): SessionRepository {
  const insert = db.prepare(
    `INSERT INTO sessions (token_hash, user_id, created_at, expires_at)
     VALUES (@tokenHash, @userId, @createdAt, @expiresAt)`,
  );
  const findActive = db.prepare<[string, string], { user_id: string; created_at: string }>(
    'SELECT user_id, created_at FROM sessions WHERE token_hash = ? AND expires_at > ?',
  );
  const remove = db.prepare('DELETE FROM sessions WHERE token_hash = ?');

  return {
    insert: (session) => void insert.run(session),
    findActive: (tokenHash, now) => {
      const row = findActive.get(tokenHash, now);
      return row && { userId: row.user_id, createdAt: row.created_at };
    },
    delete: (tokenHash) => void remove.run(tokenHash),
  };
}
