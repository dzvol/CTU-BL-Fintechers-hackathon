import type { ChainReader } from '../adapters/chain-reader';
import type { JevClient } from '../adapters/jev/jev-client';
import type { Signer } from '../adapters/signer';
import type { Thresholds } from '../domain/decision/decide';
import type { Store } from '../adapters/store';
import type { X402PaymentRequired, X402Transport } from '../adapters/x402';
import {
  createRejectingWebAuthnVerifier,
  type WebAuthnVerifier,
} from '../adapters/webauthn/webauthn-verifier';
import { defaultPolicy, type Policy } from '../domain/policy/policy';
import { createAccountService } from './account/account-service';
import { createApiKeyService } from './account/api-key-service';
import { createApprovalService } from './approval/approval-service';
import { createIntentService } from './intent/intent-service';
import {
  createPaymentGateway,
  type SelectedOffer,
  type SettlementChecks,
} from './payment-gateway/payment-gateway';
import { createPasskeyService } from './passkey/passkey-service';
import { createReviewService } from './review/review-service';
import { createTaskService } from './task/task-service';

/** Wires all application services. Shared by the app and tests (which pass a fixed clock). */
export function createServices(deps: {
  store: Store;
  transport: X402Transport;
  userAllocation: bigint;
  webBaseUrl: string;
  jev: JevClient;
  /** How the decision table reads Jev's answers (the active Jev variant). */
  thresholds?: Thresholds;
  /** Undefined when SPONSOR_PRIVATE_KEY isn't set: payments are refused (fail closed). */
  signer: Signer | undefined;
  chainReader: ChainReader;
  /** Total the sponsor pool hands out over all users. */
  poolLimit: bigint;
  /** Tests may swap the rules; defaults to the real Policy. */
  policy?: Policy;
  /** Tests may swap the offer selection; defaults to the supported x402 profile. */
  selectOffer?: (
    paymentRequired: X402PaymentRequired,
    requestedUrl: string,
  ) => SelectedOffer | undefined;
  settlementChecks?: SettlementChecks;
  /** Checks passkeys for dashboard approvals; without one every passkey check fails. */
  webauthn?: WebAuthnVerifier;
  /** PASSKEY_REQUIRED: approvals need a passkey even for users who haven't set one up. */
  passkeyRequired?: boolean;
  now?: () => Date;
}) {
  const { store, now } = deps;

  const accounts = createAccountService({
    users: store.users,
    allocations: store.allocations,
    ledger: store.ledger,
    transaction: store.transaction,
    defaultAllocation: deps.userAllocation,
    now,
  });
  const tasks = createTaskService({
    tasks: store.tasks,
    ledger: store.ledger,
    transaction: store.transaction,
    now,
  });
  const intents = createIntentService({
    intents: store.intents,
    ledger: store.ledger,
    tasks,
    transaction: store.transaction,
    webBaseUrl: deps.webBaseUrl,
    now,
  });
  const apiKeys = createApiKeyService({
    apiKeys: store.apiKeys,
    fundsLeft: accounts.fundsLeft,
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

  const passkeys = createPasskeyService({
    passkeys: store.passkeys,
    challenges: store.challenges,
    users: store.users,
    intents: store.intents,
    reviews: store.reviews,
    operations: store.operations,
    verifier: deps.webauthn ?? createRejectingWebAuthnVerifier(),
    transaction: store.transaction,
    required: deps.passkeyRequired ?? false,
    now,
  });

  return {
    accounts,
    apiKeys,
    tasks,
    intents,
    reviews,
    passkeys,
    approvals: createApprovalService({ passkeys, intents, reviews }),
    payments: createPaymentGateway({
      operations: store.operations,
      allocations: store.allocations,
      ledger: store.ledger,
      payments: store.payments,
      tasks,
      intents,
      reviews,
      transaction: store.transaction,
      transport: deps.transport,
      policy: deps.policy ?? defaultPolicy,
      jev: deps.jev,
      thresholds: deps.thresholds,
      signer: deps.signer,
      chainReader: deps.chainReader,
      poolLimit: deps.poolLimit,
      selectOffer: deps.selectOffer,
      settlementChecks: deps.settlementChecks,
      now,
    }),
  };
}

export type Services = ReturnType<typeof createServices>;
