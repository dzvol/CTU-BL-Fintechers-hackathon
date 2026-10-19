import type { UserId } from '@semanticauth/contracts';
import type { Db } from './db';

export interface UserRecord {
  id: UserId;
  googleSub: string;
  email: string;
  name: string | null;
  picture: string | null;
  createdAt: string;
  lastLoginAt: string;
}

export interface UserProfileUpdate {
  email: string;
  name: string | null;
  picture: string | null;
  lastLoginAt: string;
}

export interface UserRepository {
  findById(id: UserId): UserRecord | undefined;
  findByGoogleSub(googleSub: string): UserRecord | undefined;
  insert(user: UserRecord): void;
  updateProfile(id: UserId, update: UserProfileUpdate): void;
}

interface UserRow {
  id: string;
  google_sub: string;
  email: string;
  name: string | null;
  picture: string | null;
  created_at: string;
  last_login_at: string;
}

const toRecord = (row: UserRow): UserRecord => ({
  id: row.id,
  googleSub: row.google_sub,
  email: row.email,
  name: row.name,
  picture: row.picture,
  createdAt: row.created_at,
  lastLoginAt: row.last_login_at,
});

export function createUserRepository(db: Db): UserRepository {
  const byId = db.prepare<[string], UserRow>('SELECT * FROM users WHERE id = ?');
  const byGoogleSub = db.prepare<[string], UserRow>('SELECT * FROM users WHERE google_sub = ?');
  const insert = db.prepare(
    `INSERT INTO users (id, google_sub, email, name, picture, created_at, last_login_at)
     VALUES (@id, @googleSub, @email, @name, @picture, @createdAt, @lastLoginAt)`,
  );
  const update = db.prepare(
    `UPDATE users SET email = @email, name = @name, picture = @picture, last_login_at = @lastLoginAt
     WHERE id = @id`,
  );

  return {
    findById: (id) => {
      const row = byId.get(id);
      return row && toRecord(row);
    },
    findByGoogleSub: (googleSub) => {
      const row = byGoogleSub.get(googleSub);
      return row && toRecord(row);
    },
    insert: (user) => void insert.run(user),
    updateProfile: (id, profile) => void update.run({ id, ...profile }),
  };
}
