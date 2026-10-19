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
import { ForbiddenError, NotFoundError, ServiceError } from '../errors';

const KEY_PREFIX = 'sa_';

/** The user's sponsored allocation is used up: no new key, existing keys are refused. */
export class AllocationExhaustedError extends ServiceError {
  constructor() {
    super(
      403,
      'allocation_exhausted',
      'The sponsored allocation is used up; API keys stop working until it is raised',
    );
  }
}
/** "sa_" + 7 characters: enough to tell keys apart in the dashboard, useless for guessing. */
const DISPLAY_PREFIX_LENGTH = 10;

export interface ApiKeyService {
  /**
   * One active key per user: creating a key revokes the previous one. Returns the full key; it
   * can't be retrieved again. Refused once the user's allocation is used up.
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
  /** What the user can still spend; a key with nothing to spend is not handed out. */
  fundsLeft: (userId: UserId) => bigint;
  /** Runs in the revoking transaction, e.g. to end the key's task and pending intent. */
  onRevoked?: (apiKeyId: ApiKeyId, at: string) => void;
  now?: () => Date;
}): ApiKeyService {
  const now = deps.now ?? (() => new Date());
  const onRevoked = deps.onRevoked ?? (() => {});

  const ownedKey = (userId: UserId, apiKeyId: ApiKeyId) => {
    const record = deps.apiKeys.findById(apiKeyId);
    if (!record) throw new NotFoundError('API key');
    if (record.userId !== userId) throw new ForbiddenError('API key');
    return record;
  };

  return {
    create(userId, name) {
      if (deps.fundsLeft(userId) <= 0n) throw new AllocationExhaustedError();
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
        const previous = deps.apiKeys.listByUser(userId).filter((k) => !k.revokedAt);
        deps.apiKeys.revokeActiveByUser(userId, createdAt);
        for (const old of previous) onRevoked(old.id, createdAt);
        deps.apiKeys.insert(record);
      });
      return { apiKey: toApiKey(record), key };
    },

    list: (userId) => deps.apiKeys.listByUser(userId).map(toApiKey),

    revoke(userId, apiKeyId) {
      return deps.transaction(() => {
        const record = ownedKey(userId, apiKeyId);
        if (!record.revokedAt) {
          const at = now().toISOString();
          deps.apiKeys.revoke(apiKeyId, at);
          onRevoked(apiKeyId, at);
        }
        return toApiKey(deps.apiKeys.findById(apiKeyId)!);
      });
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
