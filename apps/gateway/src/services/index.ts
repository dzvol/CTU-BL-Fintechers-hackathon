import { createPassThroughJev } from '../adapters/jev/jev-client';
import type { Store } from '../adapters/store';
import { passThroughPolicy } from '../domain/policy/policy';
import { createAccountService } from './account/account-service';
import { createApiKeyService } from './account/api-key-service';
import { createIntentService } from './intent/intent-service';
import { createPaymentGateway } from './payment-gateway/payment-gateway';
import { createReviewService } from './review/review-service';
import { createTaskService } from './task/task-service';

/** Wires all application services. Shared by the app and tests (which pass a fixed clock). */
export function createServices(deps: {
  store: Store;
  userAllocation: bigint;
  webBaseUrl: string;
  now?: () => Date;
}) {
  const { store, now } = deps;

  const accounts = createAccountService({
    users: store.users,
    allocations: store.allocations,
    transaction: store.transaction,
    defaultAllocation: deps.userAllocation,
    now,
  });
  const tasks = createTaskService({ tasks: store.tasks, transaction: store.transaction, now });
  const intents = createIntentService({
    intents: store.intents,
    allocations: store.allocations,
    tasks,
    transaction: store.transaction,
    webBaseUrl: deps.webBaseUrl,
    now,
  });
  const apiKeys = createApiKeyService({
    apiKeys: store.apiKeys,
    transaction: store.transaction,
    // A revoked or rotated key can't use its task or pending intent anymore.
    onRevoked: (apiKeyId, at) => {
      tasks.closeForApiKey(apiKeyId, at);
      intents.expireForApiKey(apiKeyId, at);
    },
    now,
  });

  return {
    accounts,
    apiKeys,
    tasks,
    intents,
    payments: createPaymentGateway({
      operations: store.operations,
      tasks,
      intents,
      transaction: store.transaction,
      policy: passThroughPolicy,
      jev: createPassThroughJev(),
      now,
    }),
    reviews: createReviewService(),
  };
}

export type Services = ReturnType<typeof createServices>;
