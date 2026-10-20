import type { PasskeyId, UserId } from '@semanticauth/contracts';
import type { Db } from './db';

export interface PasskeyRecord {
  id: PasskeyId;
  userId: UserId;
  /** base64url */
  credentialId: string;
  /** base64url COSE public key */
  publicKey: string;
  counter: number;
  transports: string[];
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface PasskeyRepository {
  insert(passkey: PasskeyRecord): void;
  findById(id: PasskeyId): PasskeyRecord | undefined;
  findByCredentialId(credentialId: string): PasskeyRecord | undefined;
  listByUser(userId: UserId): PasskeyRecord[];
  countByUser(userId: UserId): number;
  /** Stores the authenticator's new signature counter; false if the counter moved meanwhile. */
  recordUse(id: PasskeyId, expectedCounter: number, newCounter: number, at: string): boolean;
  delete(id: PasskeyId): void;
}

interface PasskeyRow {
  id: string;
  user_id: string;
  credential_id: string;
  public_key: string;
  counter: number;
  transports: string;
  name: string;
  created_at: string;
  last_used_at: string | null;
}

const toRecord = (row: PasskeyRow): PasskeyRecord => ({
  id: row.id,
  userId: row.user_id,
  credentialId: row.credential_id,
  publicKey: row.public_key,
  counter: row.counter,
  transports: JSON.parse(row.transports) as string[],
  name: row.name,
  createdAt: row.created_at,
  lastUsedAt: row.last_used_at,
});

export function createPasskeyRepository(db: Db): PasskeyRepository {
  const insert = db.prepare(
    `INSERT INTO passkeys (id, user_id, credential_id, public_key, counter, transports, name,
       created_at, last_used_at)
     VALUES (@id, @userId, @credentialId, @publicKey, @counter, @transports, @name, @createdAt,
       @lastUsedAt)`,
  );
  const byId = db.prepare<[string], PasskeyRow>('SELECT * FROM passkeys WHERE id = ?');
  const byCredential = db.prepare<[string], PasskeyRow>(
    'SELECT * FROM passkeys WHERE credential_id = ?',
  );
  const byUser = db.prepare<[string], PasskeyRow>(
    'SELECT * FROM passkeys WHERE user_id = ? ORDER BY created_at',
  );
  const count = db
    .prepare<[string], number>('SELECT COUNT(*) FROM passkeys WHERE user_id = ?')
    .pluck();
  const recordUse = db.prepare(
    'UPDATE passkeys SET counter = ?, last_used_at = ? WHERE id = ? AND counter = ?',
  );
  const remove = db.prepare('DELETE FROM passkeys WHERE id = ?');

  const one = (row: PasskeyRow | undefined) => row && toRecord(row);

  return {
    insert: (passkey) =>
      void insert.run({ ...passkey, transports: JSON.stringify(passkey.transports) }),
    findById: (id) => one(byId.get(id)),
    findByCredentialId: (credentialId) => one(byCredential.get(credentialId)),
    listByUser: (userId) => byUser.all(userId).map(toRecord),
    countByUser: (userId) => count.get(userId) ?? 0,
    recordUse: (id, expectedCounter, newCounter, at) =>
      recordUse.run(newCounter, at, id, expectedCounter).changes === 1,
    delete: (id) => void remove.run(id),
  };
}
