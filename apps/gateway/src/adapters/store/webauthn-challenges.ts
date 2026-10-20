import type { ChallengeId, UserId } from '@semanticauth/contracts';
import type { Db } from './db';

export type ChallengePurpose = 'registration' | 'step_up';

export interface ChallengeRecord {
  id: ChallengeId;
  userId: UserId;
  purpose: ChallengePurpose;
  /** Canonical action JSON the challenge is bound to; null for registration. */
  action: string | null;
  /** base64url, what the authenticator signs. */
  challenge: string;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
}

export interface ChallengeRepository {
  insert(challenge: ChallengeRecord): void;
  findById(id: ChallengeId): ChallengeRecord | undefined;
  /** Marks the challenge used; false if it already was (each challenge works once). */
  consume(id: ChallengeId, at: string): boolean;
}

interface ChallengeRow {
  id: string;
  user_id: string;
  purpose: ChallengePurpose;
  action: string | null;
  challenge: string;
  created_at: string;
  expires_at: string;
  used_at: string | null;
}

const toRecord = (row: ChallengeRow): ChallengeRecord => ({
  id: row.id,
  userId: row.user_id,
  purpose: row.purpose,
  action: row.action,
  challenge: row.challenge,
  createdAt: row.created_at,
  expiresAt: row.expires_at,
  usedAt: row.used_at,
});

export function createChallengeRepository(db: Db): ChallengeRepository {
  const insert = db.prepare(
    `INSERT INTO webauthn_challenges (id, user_id, purpose, action, challenge, created_at,
       expires_at, used_at)
     VALUES (@id, @userId, @purpose, @action, @challenge, @createdAt, @expiresAt, @usedAt)`,
  );
  const byId = db.prepare<[string], ChallengeRow>('SELECT * FROM webauthn_challenges WHERE id = ?');
  const consume = db.prepare(
    'UPDATE webauthn_challenges SET used_at = ? WHERE id = ? AND used_at IS NULL',
  );

  return {
    insert: (challenge) => void insert.run(challenge),
    findById: (id) => {
      const row = byId.get(id);
      return row && toRecord(row);
    },
    consume: (id, at) => consume.run(at, id).changes === 1,
  };
}
