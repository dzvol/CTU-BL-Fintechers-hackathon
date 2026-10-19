import type { JevClient } from '../adapters/jev/jev-client';
import type { Store } from '../adapters/store';
import type { X402PaymentRequired, X402Transport } from '../adapters/x402';
import { defaultPolicy, type Policy } from '../domain/policy/policy';
import { createAccountService } from './account/account-service';
import { createApiKeyService } from './account/api-key-service';
import { createIntentService } from './intent/intent-service';
import { createPaymentGateway, type SelectedOffer } from './payment-gateway/payment-gateway';
import { createReviewService } from './review/review-service';
import { createTaskService } from './task/task-service';

/** Wires all application services. Shared by the app and tests (which pass a fixed clock). */
export function createServices(deps: {
  store: Store;
  transport: X402Transport;
  userAllocation: bigint;
  webBaseUrl: string;
  jev: JevClient;
  /** Tests may swap the rules; defaults to the real Policy. */
  policy?: Policy;
  /** Tests only, until member 3's offer selection exists. */
  selectOffer?: (paymentRequired: X402PaymentRequired) => SelectedOffer | undefined;
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

  const reviews = createReviewService({
    reviews: store.reviews,
    operations: store.operations,
    transaction: store.transaction,
    now,
  });

  return {
    accounts,
    apiKeys,
    tasks,
    intents,
    reviews,
    payments: createPaymentGateway({
      operations: store.operations,
      allocations: store.allocations,
      tasks,
      intents,
      reviews,
      transaction: store.transaction,
      transport: deps.transport,
      policy: deps.policy ?? defaultPolicy,
      jev: deps.jev,
      selectOffer: deps.selectOffer,
      now,
    }),
  };
}

export type Services = ReturnType<typeof createServices>;
