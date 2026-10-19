import type { ApiKeyId, UserId } from '@semanticauth/contracts';
import type { Db } from './db';

export interface ApiKeyRecord {
  id: ApiKeyId;
  userId: UserId;
  name: string;
  prefix: string;
  keyHash: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface ApiKeyRepository {
  insert(key: ApiKeyRecord): void;
  findById(id: ApiKeyId): ApiKeyRecord | undefined;
  findByHash(keyHash: string): ApiKeyRecord | undefined;
  listByUser(userId: UserId): ApiKeyRecord[];
  markUsed(id: ApiKeyId, at: string): void;
  revoke(id: ApiKeyId, at: string): void;
  revokeActiveByUser(userId: UserId, at: string): void;
}

interface ApiKeyRow {
  id: string;
  user_id: string;
  name: string;
  prefix: string;
  key_hash: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

const toRecord = (row: ApiKeyRow): ApiKeyRecord => ({
  id: row.id,
  userId: row.user_id,
  name: row.name,
  prefix: row.prefix,
  keyHash: row.key_hash,
  createdAt: row.created_at,
  lastUsedAt: row.last_used_at,
  revokedAt: row.revoked_at,
});

export function createApiKeyRepository(db: Db): ApiKeyRepository {
  const insert = db.prepare(
    `INSERT INTO api_keys (id, user_id, name, prefix, key_hash, created_at, last_used_at, revoked_at)
     VALUES (@id, @userId, @name, @prefix, @keyHash, @createdAt, @lastUsedAt, @revokedAt)`,
  );
  const byId = db.prepare<[string], ApiKeyRow>('SELECT * FROM api_keys WHERE id = ?');
  const byHash = db.prepare<[string], ApiKeyRow>('SELECT * FROM api_keys WHERE key_hash = ?');
  const byUser = db.prepare<[string], ApiKeyRow>(
    'SELECT * FROM api_keys WHERE user_id = ? ORDER BY created_at DESC',
  );
  const revokeActiveByUser = db.prepare(
    'UPDATE api_keys SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL',
  );
  const markUsed = db.prepare('UPDATE api_keys SET last_used_at = ? WHERE id = ?');
  const revoke = db.prepare(
    'UPDATE api_keys SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL',
  );

  return {
    insert: (key) => void insert.run(key),
    findById: (id) => {
      const row = byId.get(id);
      return row && toRecord(row);
    },
    findByHash: (keyHash) => {
      const row = byHash.get(keyHash);
      return row && toRecord(row);
    },
    listByUser: (userId) => byUser.all(userId).map(toRecord),
    markUsed: (id, at) => void markUsed.run(at, id),
    revoke: (id, at) => void revoke.run(at, id),
    revokeActiveByUser: (userId, at) => void revokeActiveByUser.run(at, userId),
  };
}
