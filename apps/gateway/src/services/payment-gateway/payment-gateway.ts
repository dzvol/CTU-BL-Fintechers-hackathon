import {
  formatUsdc,
  newId,
  TxHashSchema,
  type NormalizedOffer,
  type Operation,
  type OperationId,
  type OperationState,
  type PaidFetchInput,
  type PaidFetchResult,
  type ReviewId,
  type Task,
  type TaskId,
  type UserId,
  type VerdictReason,
} from '@semanticauth/contracts';
import type { ChainReader, PaymentVerification } from '../../adapters/chain-reader';
import type { JevClient } from '../../adapters/jev/jev-client';
import { SIGNER_PROFILE, type Signer } from '../../adapters/signer';
import type {
  AllocationRepository,
  LedgerRepository,
  OperationPatch,
  OperationRecord,
  OperationRepository,
  PaymentRepository,
  Transaction,
} from '../../adapters/store';
import {
  encodePaymentSignature,
  type X402HttpResponse,
  type X402PaymentRequired,
  type X402Request,
  type X402Transport,
  type X402TransportResult,
} from '../../adapters/x402';
import type { Purchase } from '../../domain/facts/facts';
import { toScreenState, type ScreenState } from '../../domain/jev/state';
import {
  checkReservation,
  toVerdictReason,
  type ReservationRejectReason,
} from '../../domain/ledger';
import { mapPaymentRequired } from '../../domain/normalizer';
import { canTransition, failureState } from '../../domain/operation/state-machine';
import type { Policy } from '../../domain/policy/policy';
import type { AgentContext } from '../context';
import { ConflictError, ForbiddenError, NotFoundError, NotImplementedError } from '../errors';
import type { IntentService } from '../intent/intent-service';
import type { ReviewService } from '../review/review-service';
import type { TaskService } from '../task/task-service';
import { evaluateOffer } from './evaluation';
import { selectOffer as selectSupportedOffer, type SelectedOffer } from './offer-selection';

export type { SelectedOffer } from './offer-selection';

export interface PaymentGateway {
  /**
   * The whole `paid_fetch` workflow for the agent's active task. Idempotent per task and URL:
   * repeating a request returns the original operation and never pays twice.
   */
  paidFetch(agent: AgentContext, input: PaidFetchInput): Promise<PaidFetchResult>;
  listOperations(userId: UserId, filter: { taskId?: TaskId }): Operation[];
  getOperation(userId: UserId, operationId: OperationId): Operation;
  /**
   * Call once at startup, before serving requests: operations a previous process left in
   * flight are blocked (nothing was signed yet, the reservation is released) or marked unknown
   * (the authorization may have left; it stays spent for reconciliation). Returns how many.
   */
  recoverInterrupted(): number;
}

/**
 * TODO(jev): Screen the delivered content (prompt injection in the data) before the agent gets
 * it. The Screen input comes from mapDataReceival(result.normalizerInput, contentType).
 */
async function screenDelivery(_result: { response: X402HttpResponse; normalizerInput: unknown }) {}

/** How often to read the chain again while the merchant's transaction isn't visible yet. */
export interface SettlementChecks {
  attempts: number;
  delayMs: number;
}
const DEFAULT_SETTLEMENT_CHECKS: SettlementChecks = { attempts: 5, delayMs: 2_000 };

/** Chain reads that may succeed a moment later. Reading again never pays again. */
const TRANSIENT: ReadonlySet<string> = new Set([
  'receipt_not_found',
  'insufficient_confirmations',
  'rpc_unavailable',
]);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const REPEATED = 'This URL was already requested in this task; this is the original operation.';

const RESERVATION_DETAIL: Record<ReservationRejectReason, string> = {
  invalid_amount: 'the price is not a positive amount',
  task_budget_exceeded: 'the price no longer fits the task budget',
  insufficient_allocation: 'the price no longer fits your allocation',
  sponsor_pool_exhausted: 'the sponsor pool has no funds left for this payment',
};

/** Left in flight by a process that stopped; see `recoverInterrupted`. */
const IN_FLIGHT: readonly OperationState[] = [
  'requested',
  'reserved',
  'prepared',
  'issued',
  'submitted',
];

interface Delivery {
  content: string;
  contentType?: string;
}

/** Another request moved the operation first; that request owns its outcome. */
class ConcurrentChangeError extends Error {}

/** Same payment as the one the user approved: nothing the merchant could have swapped. */
const sameOffer = (a: NormalizedOffer, b: NormalizedOffer) =>
  a.scheme === b.scheme &&
  a.network === b.network &&
  a.asset.toLowerCase() === b.asset.toLowerCase() &&
  a.payTo.toLowerCase() === b.payTo.toLowerCase() &&
  a.amount === b.amount &&
  a.resourceUrl === b.resourceUrl;

/** What the merchant answered, already sorted into what the pipeline can act on. */
type Fetched =
  | { kind: 'content'; delivery: Delivery }
  | { kind: 'refused'; reason: VerdictReason; detail: string }
  | { kind: 'offer'; selected: SelectedOffer; screenState: ScreenState };

/** The operation being processed; every state change goes through `move`. */
interface Run {
  readonly id: OperationId;
  readonly taskId: TaskId;
  readonly userId: UserId;
  readonly url: string;
  readonly state: OperationState;
  move(to: OperationState, patch?: OperationPatch): void;
}

/** What the agent receives: the body as text, never the internal transport response. */
function deliveryOf(response: X402HttpResponse): Delivery {
  const content =
    response.bodyFormat === 'empty'
      ? ''
      : response.bodyFormat === 'base64'
        ? String(response.body)
        : (response.bodyText ?? JSON.stringify(response.body));
  return { content, contentType: response.contentType };
}

const toOperation = (op: OperationRecord): Operation => ({
  id: op.id,
  taskId: op.taskId,
  url: op.url,
  state: op.state,
  verdict: op.verdict ?? undefined,
  reason: op.reason ?? undefined,
  offer: op.offer ?? undefined,
  settlement: op.settlement ?? undefined,
  message: op.message ?? undefined,
  createdAt: op.createdAt,
  updatedAt: op.updatedAt,
});

function toResult(
  op: OperationRecord,
  delivery?: Delivery,
  note?: string,
  reviewId?: ReviewId,
): PaidFetchResult {
  return {
    operationId: op.id,
    state: op.state,
    verdict: op.verdict ?? undefined,
    reason: op.reason ?? undefined,
    reviewId,
    content: delivery?.content,
    contentType: delivery?.contentType,
    settlement: op.settlement ?? undefined,
    message: [note, op.message].filter(Boolean).join(' ') || op.state,
  };
}

const paid = (offer: NormalizedOffer) =>
  `${formatUsdc(BigInt(offer.amount))} USDC to ${offer.payTo}`;

export function createPaymentGateway(deps: {
  operations: OperationRepository;
  allocations: AllocationRepository;
  ledger: LedgerRepository;
  payments: PaymentRepository;
  tasks: TaskService;
  intents: IntentService;
  reviews: ReviewService;
  transaction: Transaction;
  transport: X402Transport;
  policy: Policy;
  jev: JevClient;
  /** Undefined when SPONSOR_PRIVATE_KEY isn't set: every payment is refused (fail closed). */
  signer: Signer | undefined;
  chainReader: ChainReader;
  /** Total the sponsor pool hands out over all users. */
  poolLimit: bigint;
  /** Tests may swap the offer selection; defaults to the supported x402 profile. */
  selectOffer?: (
    paymentRequired: X402PaymentRequired,
    requestedUrl: string,
  ) => SelectedOffer | undefined;
  settlementChecks?: SettlementChecks;
  now?: () => Date;
}): PaymentGateway {
  const now = deps.now ?? (() => new Date());
  const selectOffer = deps.selectOffer ?? selectSupportedOffer;
  const checks = deps.settlementChecks ?? DEFAULT_SETTLEMENT_CHECKS;

  function track(op: OperationRecord): Run {
    let state = op.state;
    return {
      id: op.id,
      taskId: op.taskId,
      userId: op.userId,
      url: op.url,
      get state() {
        return state;
      },
      move(to, patch = {}) {
        if (!canTransition(state, to)) throw new Error(`Invalid transition ${state} → ${to}`);
        if (!deps.operations.transition(op.id, state, to, patch, now().toISOString())) {
          throw new ConcurrentChangeError(`Operation ${op.id} changed concurrently`);
        }
        state = to;
      },
    };
  }

  const block = (run: Run, reason: VerdictReason, detail: string, extra: OperationPatch = {}) =>
    run.move('blocked', {
      ...extra,
      verdict: 'BLOCK',
      reason,
      message: `Blocked (${reason}): ${detail}. Nothing was paid.`,
    });

  /** Refuses before anything was reserved: blocked, or closed when resuming an approved review. */
  function refuse(run: Run, reason: VerdictReason, detail: string, extra: OperationPatch = {}) {
    if (run.state !== 'awaiting_review') return block(run, reason, detail, extra);
    run.move('closed', {
      ...extra,
      verdict: 'BLOCK',
      reason,
      message: `Closed after review: ${detail}. Nothing was paid.`,
    });
  }

  /**
   * Fail closed: blocked before the authorization was issued (releasing any reservation), closed
   * when resuming a review failed before reserving, unknown (counts as spent) after issuing.
   */
  function fail(run: Run, err: unknown) {
    if (err instanceof ConcurrentChangeError) return;
    const target = failureState(run.state);
    if (!target) throw err;
    if (!(err instanceof NotImplementedError)) console.error(`Operation ${run.id} failed:`, err);
    const cause = err instanceof NotImplementedError ? err.message : 'Internal error';
    if (target === 'blocked') {
      return deps.transaction(() => {
        deps.ledger.release(run.id, now().toISOString());
        block(run, 'internal_error', cause);
      });
    }
    if (target === 'closed') return run.move('closed', { message: `${cause}. Nothing was paid.` });
    run.move('unknown', {
      message: `${cause}. The payment outcome is unknown and counts as spent; do not retry.`,
    });
  }

  /** Fetches the URL and turns the merchant's answer into content, a refusal or one offer. */
  async function fetchOffer(request: X402Request): Promise<Fetched> {
    const result = await deps.transport.fetchResource(request);
    const refused = (reason: VerdictReason, detail: string) =>
      ({ kind: 'refused', reason, detail }) as const;
    switch (result.kind) {
      case 'content':
        await screenDelivery(result);
        return { kind: 'content', delivery: deliveryOf(result.response) };
      case 'invalid_response':
        return refused('unsupported_offer', 'the merchant sent invalid payment requirements');
      case 'http_error':
        return refused('merchant_error', `the merchant answered HTTP ${result.response.status}`);
      case 'transport_error':
        return refused('merchant_error', `the merchant could not be reached (${result.reason})`);
      case 'invalid_request':
        return refused('merchant_error', `the request was rejected (${result.reason})`);
      case 'payment_required':
        break;
    }

    // Screen input: every merchant-controlled field of the 402, including its body.
    const screenInput = mapPaymentRequired(result.normalizerInput);
    if (!screenInput.success || screenInput.queries.length === 0) {
      return refused('unsupported_offer', 'the payment requirements could not be read');
    }
    const selected = selectOffer(result.paymentRequired, request.url);
    if (!selected) {
      return refused('unsupported_offer', 'no payment option matches exact/Base Sepolia/USDC');
    }
    return { kind: 'offer', selected, screenState: toScreenState(screenInput.queries[0]!) };
  }

  /** The user's purchases that reserved or spent money; the ledger decides what still counts. */
  const purchasesOf = (userId: UserId): Purchase[] =>
    deps.operations.listByUser(userId, {}).flatMap((op) => {
      const entry = op.offer ? deps.ledger.findByOperation(op.id) : undefined;
      return op.offer && entry && entry.state !== 'released'
        ? [{ taskId: op.taskId, payTo: op.offer.payTo, amount: entry.amount }]
        : [];
    });

  const policyInput = (agent: AgentContext, task: Task, offer: NormalizedOffer) => ({
    offer,
    intent: deps.intents.getForUser(agent.userId, task.intentId),
    task,
    purchases: purchasesOf(agent.userId),
    allocation: deps.allocations.findAmount(agent.userId) ?? 0n,
  });

  /** Fetch → normalize → evaluate → pay. Any throw is turned into a fail-closed state by `fail`. */
  async function runPipeline(
    run: Run,
    agent: AgentContext,
    task: Task,
  ): Promise<Delivery | undefined> {
    const request: X402Request = { url: run.url };
    const fetched = await fetchOffer(request);
    if (fetched.kind === 'content') {
      run.move('delivered', {
        verdict: 'ALLOW',
        reason: 'free_content',
        message: 'Free content, no payment needed.',
      });
      return fetched.delivery;
    }
    if (fetched.kind === 'refused') {
      block(run, fetched.reason, fetched.detail);
      return undefined;
    }

    const { offer } = fetched.selected;
    const decision = await evaluateOffer(
      { policy: deps.policy, jev: deps.jev },
      {
        ...policyInput(agent, task, offer),
        screenState: fetched.screenState,
        requestedUrl: run.url,
      },
    );

    if (decision.verdict === 'BLOCK') {
      block(run, decision.reason, decision.detail, { offer });
      return undefined;
    }
    if (decision.verdict === 'REVIEW') {
      deps.transaction(() => {
        run.move('awaiting_review', {
          verdict: decision.verdict,
          reason: decision.reason,
          offer,
          message: `Waiting for the user's review (${decision.reason}): ${decision.detail}. Poll check_review; nothing was paid yet.`,
        });
        deps.reviews.open(deps.operations.findById(run.id)!, decision, offer);
      });
      return undefined;
    }
    return executePayment(run, request, fetched.selected, { reason: decision.reason });
  }

  /**
   * The user approved the review: fetch the offer again and pay only if it is the very offer
   * they approved and Policy still allows it. Jev isn't asked again; the user decided instead.
   */
  async function resumeAfterReview(
    run: Run,
    agent: AgentContext,
    task: Task,
    approved: NormalizedOffer,
  ): Promise<Delivery | undefined> {
    const close = (detail: string, patch: OperationPatch = {}) =>
      run.move('closed', {
        ...patch,
        message: `Closed after review: ${detail}. Nothing was paid.`,
      });

    const request: X402Request = { url: run.url };
    const fetched = await fetchOffer(request);
    if (fetched.kind !== 'offer') {
      close('the merchant no longer asks for the approved payment');
      return undefined;
    }
    if (!sameOffer(fetched.selected.offer, approved)) {
      close('the offer changed since the user approved it');
      return undefined;
    }
    const policy = deps.policy(policyInput(agent, task, fetched.selected.offer));
    if (!policy.ok) {
      close(policy.detail, { verdict: 'BLOCK', reason: policy.reason });
      return undefined;
    }
    // The review's reason stays on the operation: it says why the user was asked.
    return executePayment(run, request, fetched.selected, {});
  }

  /**
   * After ALLOW or an approved review, in the order the invariants require: reserve atomically,
   * sign, persist the authorization as `issued` (spent from then on), and only then send it.
   */
  async function executePayment(
    run: Run,
    request: X402Request,
    { offer, requirements }: SelectedOffer,
    allowed: OperationPatch,
  ): Promise<Delivery | undefined> {
    const { signer } = deps;
    if (!signer) {
      refuse(run, 'internal_error', 'payments are not configured on this gateway', { offer });
      return undefined;
    }
    const amount = BigInt(offer.amount);

    // The reservation and the state change commit together or not at all.
    const reservation = deps.transaction(() => {
      const reserved = deps.ledger.reserve(
        {
          operationId: run.id,
          userId: run.userId,
          taskId: run.taskId,
          amount,
          poolLimit: deps.poolLimit,
          at: now().toISOString(),
        },
        checkReservation,
      );
      if (!reserved.ok) return reserved;
      if (!reserved.created)
        throw new ConcurrentChangeError(`Operation ${run.id} is already paying`);
      run.move('reserved', {
        ...allowed,
        verdict: 'ALLOW',
        offer,
        message: `Reserved ${formatUsdc(amount)} USDC; paying the merchant.`,
      });
      return reserved;
    });
    if (!reservation.ok) {
      const detail = RESERVATION_DETAIL[reservation.reason];
      refuse(run, toVerdictReason(reservation.reason), detail, { offer });
      return undefined;
    }

    const signed = await signer.signPayment({
      operation: { id: run.id, url: run.url, state: 'reserved', verdict: 'ALLOW', offer },
      reservation: { operationId: run.id, state: 'reserved', amount },
      requirements,
    });
    if (!signed.ok) {
      deps.transaction(() => {
        deps.ledger.release(run.id, now().toISOString());
        block(
          run,
          signed.reason === 'unsupported_offer' ? 'unsupported_offer' : 'internal_error',
          `the payment could not be signed (${signed.reason})`,
        );
      });
      return undefined;
    }
    run.move('prepared');

    // Persisted before it leaves the gateway: after a crash we still know what may have been paid.
    const paymentSignature = encodePaymentSignature(signed.paymentPayload);
    const { authorization } = signed.paymentPayload.payload;
    deps.transaction(() => {
      const at = now().toISOString();
      deps.payments.insert({
        operationId: run.id,
        payer: authorization.from,
        recipient: authorization.to,
        token: requirements.asset,
        amount,
        chainId: SIGNER_PROFILE.chainId,
        nonce: authorization.nonce,
        validBefore: authorization.validBefore,
        paymentSignature,
        txHash: null,
        createdAt: at,
        updatedAt: at,
      });
      if (!deps.ledger.markSpent(run.id, at)) throw new Error(`No reservation for ${run.id}`);
      run.move('issued', {
        message: `Paying ${paid(offer)}; the amount counts as spent from now on.`,
      });
    });

    return settle(run, offer, await deps.transport.fetchWithPayment(request, paymentSignature));
  }

  /** The merchant's claim is not proof: only a settlement ChainReader verifies counts. */
  async function settle(
    run: Run,
    offer: NormalizedOffer,
    result: X402TransportResult,
  ): Promise<Delivery | undefined> {
    const unknown = (detail: string) => {
      run.move('unknown', {
        message: `${detail}. The payment counts as spent until reconciliation settles it; do not retry.`,
      });
      return undefined;
    };
    if (result.kind === 'transport_error' || result.kind === 'invalid_request') {
      return unknown(`The paid request to the merchant failed (${result.reason})`);
    }
    const claim = result.paymentResponse;
    const txHash = claim.status === 'valid' && claim.value.success ? claim.value.transaction : '';
    if (!TxHashSchema.safeParse(txHash).success) {
      return unknown(`The merchant did not report a settlement (HTTP ${result.response.status})`);
    }
    deps.transaction(() => {
      deps.payments.setTxHash(run.id, txHash, now().toISOString());
      run.move('submitted', { message: `The merchant reported transaction ${txHash}.` });
    });

    const verification = await verifySettlement(run.id, txHash);
    if (verification.status !== 'settled') {
      return unknown(
        `Transaction ${txHash} could not be verified on chain (${verification.reason})`,
      );
    }
    run.move('settled', { settlement: verification.settlement });

    if (result.kind !== 'content') {
      run.move('delivery_failed', {
        message: `Paid ${paid(offer)} (verified on chain), but the merchant returned no content (HTTP ${result.response.status}). The payment counts as spent; do not buy it again.`,
      });
      return undefined;
    }
    await screenDelivery(result);
    run.move('delivered', { message: `Paid ${paid(offer)}; settlement verified on chain.` });
    return deliveryOf(result.response);
  }

  /** Token, amount, payer, recipient and nonce come from the persisted authorization. */
  async function verifySettlement(
    operationId: OperationId,
    txHash: string,
  ): Promise<PaymentVerification> {
    const payment = deps.payments.findByOperation(operationId);
    if (!payment) throw new Error(`No persisted payment for ${operationId}`);
    const verify = () =>
      deps.chainReader.verifyPayment({
        txHash,
        chainId: payment.chainId,
        token: payment.token,
        payer: payment.payer,
        recipient: payment.recipient,
        amount: payment.amount,
        authorizationNonce: payment.nonce,
      });
    let verification = await verify();
    for (
      let attempt = 1;
      attempt < checks.attempts &&
      verification.status === 'unknown' &&
      TRANSIENT.has(verification.reason);
      attempt++
    ) {
      await sleep(checks.delayMs);
      verification = await verify();
    }
    return verification;
  }

  /** Runs one step on the operation and returns what the agent gets. */
  async function handle(
    op: OperationRecord,
    step: (run: Run) => Promise<Delivery | undefined>,
  ): Promise<PaidFetchResult> {
    const run = track(op);
    let delivery: Delivery | undefined;
    try {
      delivery = await step(run);
    } catch (err) {
      try {
        fail(run, err);
      } catch (failure) {
        if (!(failure instanceof ConcurrentChangeError)) throw failure;
      }
    }
    return result(deps.operations.findById(op.id)!, delivery);
  }

  const result = (op: OperationRecord, delivery?: Delivery, note?: string) =>
    toResult(
      op,
      delivery,
      note,
      op.state === 'awaiting_review' ? deps.reviews.findForOperation(op.id)?.id : undefined,
    );

  /** A repeated request for an operation under review: wait, resume, or report the outcome. */
  function repeatUnderReview(op: OperationRecord, agent: AgentContext, task: Task) {
    deps.reviews.expireStale();
    const current = deps.operations.findById(op.id)!;
    const review = deps.reviews.findForOperation(op.id);
    if (current.state !== 'awaiting_review' || !review) {
      return result(current, undefined, REPEATED);
    }
    if (review.status !== 'approved') {
      return result(current, undefined, 'The user has not decided yet; poll check_review.');
    }
    return handle(current, (run) => resumeAfterReview(run, agent, task, review.offer));
  }

  const owned = (userId: UserId, operationId: OperationId) => {
    const op = deps.operations.findById(operationId);
    if (!op) throw new NotFoundError('Operation');
    if (op.userId !== userId) throw new ForbiddenError('Operation');
    return op;
  };

  return {
    async paidFetch(agent, input) {
      const task = deps.tasks.getActiveTask(agent);
      if (!task) {
        throw new ConflictError(
          'no_active_task',
          'No active task: submit an intent and wait for the user to approve it',
        );
      }
      const url = new URL(input.url).toString();

      const { op, repeated } = deps.transaction(() => {
        const existing = deps.operations.findByTaskAndUrl(task.id, url);
        if (existing) return { op: existing, repeated: true };
        const at = now().toISOString();
        const created: OperationRecord = {
          id: newId('op'),
          taskId: task.id,
          userId: agent.userId,
          url,
          state: 'requested',
          verdict: null,
          reason: null,
          offer: null,
          settlement: null,
          message: null,
          createdAt: at,
          updatedAt: at,
        };
        deps.operations.insert(created);
        return { op: created, repeated: false };
      });

      if (repeated) {
        if (op.state === 'awaiting_review') return repeatUnderReview(op, agent, task);
        return result(op, undefined, REPEATED);
      }
      return handle(op, (run) => runPipeline(run, agent, task));
    },

    listOperations: (userId, filter) => deps.operations.listByUser(userId, filter).map(toOperation),

    getOperation: (userId, operationId) => toOperation(owned(userId, operationId)),

    recoverInterrupted() {
      const interrupted = deps.operations.listByStates(IN_FLIGHT);
      for (const op of interrupted) {
        const run = track(op);
        try {
          deps.transaction(() => {
            const at = now().toISOString();
            if (canTransition(run.state, 'blocked')) {
              deps.ledger.release(run.id, at);
              block(run, 'internal_error', 'the gateway restarted before paying');
            } else {
              run.move('unknown', {
                message:
                  'The gateway restarted while paying. The payment counts as spent until reconciliation settles it; do not retry.',
              });
            }
          });
        } catch (err) {
          if (!(err instanceof ConcurrentChangeError)) throw err;
        }
      }
      return interrupted.length;
    },
  };
}
