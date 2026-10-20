import { createAllocationRepository } from './allocations';
import { createApiKeyRepository } from './api-keys';
import type { Db } from './db';
import { createIntentRepository } from './intents';
import { createLedgerRepository } from './ledger';
import { createOperationRepository } from './operations';
import { createPasskeyRepository } from './passkeys';
import { createPaymentRepository } from './payments';
import { createReviewRepository } from './reviews';
import { createSessionRepository } from './sessions';
import { createTaskRepository } from './tasks';
import { createUserRepository } from './users';
import { createChallengeRepository } from './webauthn-challenges';

export type { Db } from './db';
export { openDatabase } from './db';
export type { AllocationRepository } from './allocations';
export type { ApiKeyRecord, ApiKeyRepository } from './api-keys';
export type { IntentRecord, IntentRepository } from './intents';
export type {
  LedgerBalances,
  LedgerEntryRecord,
  LedgerRepository,
  ReserveInput,
  ReserveResult,
} from './ledger';
export type { OperationPatch, OperationRecord, OperationRepository } from './operations';
export type { PasskeyRecord, PasskeyRepository } from './passkeys';
export type { PaymentRecord, PaymentRepository } from './payments';
export type { ReviewRecord, ReviewRepository } from './reviews';
export type { TaskRecord, TaskRepository } from './tasks';
export type { SessionRecord, SessionRepository } from './sessions';
export type { UserProfileUpdate, UserRecord, UserRepository } from './users';
export type { ChallengePurpose, ChallengeRecord, ChallengeRepository } from './webauthn-challenges';

/** Runs `fn` in one SQLite transaction; repositories are synchronous. */
export type Transaction = <T>(fn: () => T) => T;

export function createStore(db: Db) {
  return {
    users: createUserRepository(db),
    sessions: createSessionRepository(db),
    allocations: createAllocationRepository(db),
    apiKeys: createApiKeyRepository(db),
    intents: createIntentRepository(db),
    tasks: createTaskRepository(db),
    operations: createOperationRepository(db),
    ledger: createLedgerRepository(db),
    payments: createPaymentRepository(db),
    reviews: createReviewRepository(db),
    passkeys: createPasskeyRepository(db),
    challenges: createChallengeRepository(db),
    transaction: (<T>(fn: () => T): T => db.transaction(fn)()) as Transaction,
  };
}

export type Store = ReturnType<typeof createStore>;
