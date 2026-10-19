import { createHash, randomBytes } from 'node:crypto';
import {
  type ApiKey,
  type ApiKeyId,
  type CreatedApiKey,
  newId,
  type UserId,
} from '@semanticauth/contracts';
import type { ApiKeyRecord, ApiKeyRepository, Transaction } from '../../adapters/store';
import type { AgentContext } from '../context';
import { ForbiddenError, NotFoundError } from '../errors';

const KEY_PREFIX = 'sa_';
/** "sa_" + 7 characters: enough to tell keys apart in the dashboard, useless for guessing. */
const DISPLAY_PREFIX_LENGTH = 10;

export interface ApiKeyService {
  /**
   * One active key per user: creating a key revokes the previous one. Returns the full key; it
   * can't be retrieved again.
   */
  create(userId: UserId, name: string): CreatedApiKey;
  list(userId: UserId): ApiKey[];
  /** Idempotent: revoking a revoked key returns it unchanged. */
  revoke(userId: UserId, apiKeyId: ApiKeyId): ApiKey;
  /** Agent identity for a valid, non-revoked key; undefined otherwise. */
  authenticate(key: string): AgentContext | undefined;
}

// Keys carry 256 bits of randomness, so a fast hash is enough (no salting/stretching needed).
const hashKey = (key: string) => createHash('sha256').update(key).digest('hex');

const toApiKey = (record: ApiKeyRecord): ApiKey => ({
  id: record.id,
  name: record.name,
  prefix: record.prefix,
  createdAt: record.createdAt,
  lastUsedAt: record.lastUsedAt ?? undefined,
  revokedAt: record.revokedAt ?? undefined,
});

export function createApiKeyService(deps: {
  apiKeys: ApiKeyRepository;
  transaction: Transaction;
  now?: () => Date;
}): ApiKeyService {
  const now = deps.now ?? (() => new Date());

  const ownedKey = (userId: UserId, apiKeyId: ApiKeyId) => {
    const record = deps.apiKeys.findById(apiKeyId);
    if (!record) throw new NotFoundError('API key');
    if (record.userId !== userId) throw new ForbiddenError('API key');
    return record;
  };

  return {
    create(userId, name) {
      const key = KEY_PREFIX + randomBytes(32).toString('base64url');
      const createdAt = now().toISOString();
      const record: ApiKeyRecord = {
        id: newId('key'),
        userId,
        name,
        prefix: key.slice(0, DISPLAY_PREFIX_LENGTH),
        keyHash: hashKey(key),
        createdAt,
        lastUsedAt: null,
        revokedAt: null,
      };
      deps.transaction(() => {
        deps.apiKeys.revokeActiveByUser(userId, createdAt);
        deps.apiKeys.insert(record);
      });
      return { apiKey: toApiKey(record), key };
    },

    list: (userId) => deps.apiKeys.listByUser(userId).map(toApiKey),

    revoke(userId, apiKeyId) {
      ownedKey(userId, apiKeyId);
      deps.apiKeys.revoke(apiKeyId, now().toISOString());
      return toApiKey(deps.apiKeys.findById(apiKeyId)!);
    },

    authenticate(key) {
      if (!key.startsWith(KEY_PREFIX)) return undefined;
      const record = deps.apiKeys.findByHash(hashKey(key));
      if (!record || record.revokedAt) return undefined;
      deps.apiKeys.markUsed(record.id, now().toISOString());
      return { userId: record.userId, apiKeyId: record.id };
    },
  };
}
