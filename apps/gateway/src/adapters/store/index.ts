import { createAllocationRepository } from './allocations';
import { createApiKeyRepository } from './api-keys';
import type { Db } from './db';
import { createSessionRepository } from './sessions';
import { createUserRepository } from './users';

export type { Db } from './db';
export { openDatabase } from './db';
export type { AllocationRepository } from './allocations';
export type { ApiKeyRecord, ApiKeyRepository } from './api-keys';
export type { SessionRecord, SessionRepository } from './sessions';
export type { UserProfileUpdate, UserRecord, UserRepository } from './users';

/** Runs `fn` in one SQLite transaction; repositories are synchronous. */
export type Transaction = <T>(fn: () => T) => T;

export function createStore(db: Db) {
  return {
    users: createUserRepository(db),
    sessions: createSessionRepository(db),
    allocations: createAllocationRepository(db),
    apiKeys: createApiKeyRepository(db),
    transaction: (<T>(fn: () => T): T => db.transaction(fn)()) as Transaction,
  };
}

export type Store = ReturnType<typeof createStore>;
