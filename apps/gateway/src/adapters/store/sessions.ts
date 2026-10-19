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
  /** User of a session that hasn't expired at `now` (ISO timestamp). */
  findActiveUserId(tokenHash: string, now: string): UserId | undefined;
  delete(tokenHash: string): void;
}

export function createSessionRepository(db: Db): SessionRepository {
  const insert = db.prepare(
    `INSERT INTO sessions (token_hash, user_id, created_at, expires_at)
     VALUES (@tokenHash, @userId, @createdAt, @expiresAt)`,
  );
  const findActive = db
    .prepare<[string, string], string>(
      'SELECT user_id FROM sessions WHERE token_hash = ? AND expires_at > ?',
    )
    .pluck();
  const remove = db.prepare('DELETE FROM sessions WHERE token_hash = ?');

  return {
    insert: (session) => void insert.run(session),
    findActiveUserId: (tokenHash, now) => findActive.get(tokenHash, now),
    delete: (tokenHash) => void remove.run(tokenHash),
  };
}
