import {
  newId,
  type NormalizedOffer,
  type Operation,
  type OperationId,
  type OperationState,
  type PaidFetchInput,
  type PaidFetchResult,
  type Task,
  type TaskId,
  type UserId,
  type VerdictReason,
} from '@semanticauth/contracts';
import type { JevClient } from '../../adapters/jev/jev-client';
import type {
  AllocationRepository,
  OperationPatch,
  OperationRecord,
  OperationRepository,
  Transaction,
} from '../../adapters/store';
import type {
  X402HttpResponse,
  X402PaymentRequired,
  X402PaymentRequirements,
  X402Request,
  X402Transport,
} from '../../adapters/x402';
import type { Purchase } from '../../domain/facts/facts';
import { toScreenState } from '../../domain/jev/state';
import { mapPaymentRequired } from '../../domain/normalizer';
import { canTransition, failureState } from '../../domain/operation/state-machine';
import type { Policy } from '../../domain/policy/policy';
import type { AgentContext } from '../context';
import { ConflictError, ForbiddenError, NotFoundError, NotImplementedError } from '../errors';
import type { IntentService } from '../intent/intent-service';
import type { TaskService } from '../task/task-service';
import { evaluateOffer } from './evaluation';

export interface PaymentGateway {
  /**
   * The whole `paid_fetch` workflow for the agent's active task. Idempotent per task and URL:
   * repeating a request returns the original operation and never pays twice.
   */
  paidFetch(agent: AgentContext, input: PaidFetchInput): Promise<PaidFetchResult>;
  listOperations(userId: UserId, filter: { taskId?: TaskId }): Operation[];
  getOperation(userId: UserId, operationId: OperationId): Operation;
}

// ---------------------------------------------------------------------------------------------
// Places where member 3's and the Jev step's work plugs in. Until then the operation is blocked
// (fail-closed) or the step passes through.

/** The x402 option the gateway would pay, as Policy sees it plus the raw option for the signer. */
interface SelectedOffer {
  offer: NormalizedOffer;
  requirements: X402PaymentRequirements;
}

/**
 * TODO(member 3): pick the option in `accepts` that matches the supported profile (scheme
 * `exact`, Base Sepolia, USDC) and build the NormalizedOffer. No matching option → undefined,
 * which blocks with `unsupported_offer`.
 */
function selectOffer(_paymentRequired: X402PaymentRequired): SelectedOffer | undefined {
  throw new NotImplementedError('Offer selection (NormalizedOffer)');
}

async function executePayment(
  _run: Run,
  _request: X402Request,
  _selected: SelectedOffer,
): Promise<Delivery> {
  // TODO(member 3), in this order, each step moving the operation forward:
  //   ledger: atomic reservation          requested → reserved  (no funds → BLOCK insufficient_allocation)
  //   signer: EIP-3009 authorization      reserved → prepared   (uses selected.requirements.extra)
  //   encodePaymentSignature + persist    prepared → issued     (BEFORE it leaves the gateway)
  //   transport.fetchWithPayment          issued → submitted
  //   ChainReader verifies settlement     submitted → settled   (unclear → unknown)
  //   screenDelivery, content to agent    settled → delivered / delivery_failed
  throw new NotImplementedError('Payment execution');
}

/**
 * TODO(jev): Screen the delivered content (prompt injection in the data) before the agent gets
 * it. The Screen input comes from mapDataReceival(result.normalizerInput, contentType).
 */
async function screenDelivery(_result: { response: X402HttpResponse; normalizerInput: unknown }) {}
// ---------------------------------------------------------------------------------------------

/** Operation states in which the offer's amount is reserved or counts as spent. */
const COMMITTED: ReadonlySet<OperationState> = new Set([
  'reserved',
  'prepared',
  'issued',
  'submitted',
  'settled',
  'delivered',
  'delivery_failed',
  'unknown',
]);

// TODO(ledger): take these from the ledger once it exists; operations are the record until then.
const purchasesOf = (operations: OperationRecord[]): Purchase[] =>
  operations.flatMap((op) =>
    op.offer && COMMITTED.has(op.state)
      ? [{ taskId: op.taskId, payTo: op.offer.payTo, amount: BigInt(op.offer.amount) }]
      : [],
  );

interface Delivery {
  content: string;
  contentType?: string;
}

/** The operation being processed; every state change goes through `move`. */
interface Run {
  readonly id: OperationId;
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

function toResult(op: OperationRecord, delivery?: Delivery, note?: string): PaidFetchResult {
  return {
    operationId: op.id,
    state: op.state,
    verdict: op.verdict ?? undefined,
    reason: op.reason ?? undefined,
    content: delivery?.content,
    contentType: delivery?.contentType,
    settlement: op.settlement ?? undefined,
    message: [note, op.message].filter(Boolean).join(' ') || op.state,
  };
}

export function createPaymentGateway(deps: {
  operations: OperationRepository;
  allocations: AllocationRepository;
  tasks: TaskService;
  intents: IntentService;
  transaction: Transaction;
  transport: X402Transport;
  policy: Policy;
  jev: JevClient;
  now?: () => Date;
}): PaymentGateway {
  const now = deps.now ?? (() => new Date());

  function track(op: OperationRecord): Run {
    let state = op.state;
    return {
      id: op.id,
      url: op.url,
      get state() {
        return state;
      },
      move(to, patch = {}) {
        if (!canTransition(state, to)) throw new Error(`Invalid transition ${state} → ${to}`);
        if (!deps.operations.transition(op.id, state, to, patch, now().toISOString())) {
          throw new Error(`Operation ${op.id} changed concurrently`);
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

  /** Fail closed: blocked before the authorization was issued, unknown (counts as spent) after. */
  function fail(run: Run, err: unknown) {
    const target = failureState(run.state);
    if (!target) throw err;
    if (!(err instanceof NotImplementedError)) console.error(`Operation ${run.id} failed:`, err);
    const cause = err instanceof NotImplementedError ? err.message : 'Internal error';
    if (target === 'blocked') return block(run, 'internal_error', cause);
    run.move('unknown', {
      message: `${cause}. The payment outcome is unknown and counts as spent; do not retry.`,
    });
  }

  /** Fetch → normalize → evaluate → pay. Any throw is turned into a fail-closed state by `fail`. */
  async function runPipeline(
    run: Run,
    agent: AgentContext,
    task: Task,
  ): Promise<Delivery | undefined> {
    const intent = deps.intents.getForUser(agent.userId, task.intentId);
    const request: X402Request = { url: run.url };

    const result = await deps.transport.fetchResource(request);
    switch (result.kind) {
      case 'content': {
        await screenDelivery(result);
        run.move('delivered', {
          verdict: 'ALLOW',
          reason: 'free_content',
          message: 'Free content, no payment needed.',
        });
        return deliveryOf(result.response);
      }
      case 'invalid_response':
        block(run, 'unsupported_offer', 'the merchant sent invalid payment requirements');
        return undefined;
      case 'http_error':
        block(run, 'merchant_error', `the merchant answered HTTP ${result.response.status}`);
        return undefined;
      case 'transport_error':
        block(run, 'merchant_error', `the merchant could not be reached (${result.reason})`);
        return undefined;
      case 'invalid_request':
        block(run, 'merchant_error', `the request was rejected (${result.reason})`);
        return undefined;
      case 'payment_required':
        break;
    }

    // Screen input: every merchant-controlled field of the 402, including its body.
    const screenInput = mapPaymentRequired(result.normalizerInput);
    if (!screenInput.success || screenInput.queries.length === 0) {
      block(run, 'unsupported_offer', 'the payment requirements could not be read');
      return undefined;
    }

    const selected = selectOffer(result.paymentRequired);
    if (!selected) {
      block(run, 'unsupported_offer', 'no payment option matches exact/Base Sepolia/USDC');
      return undefined;
    }
    const { offer } = selected;

    const decision = await evaluateOffer(
      { policy: deps.policy, jev: deps.jev },
      {
        offer,
        screenState: toScreenState(screenInput.queries[0]!),
        intent,
        task,
        purchases: purchasesOf(deps.operations.listByUser(agent.userId, {})),
        allocation: deps.allocations.findAmount(agent.userId) ?? 0n,
        requestedUrl: run.url,
      },
    );

    if (decision.verdict === 'BLOCK') {
      block(run, decision.reason, decision.detail, { offer });
      return undefined;
    }
    if (decision.verdict === 'REVIEW') {
      // TODO(review): open a review for the user via ReviewService (expires after REVIEW_TTL_MS).
      run.move('awaiting_review', {
        verdict: decision.verdict,
        reason: decision.reason,
        offer,
        message: `Waiting for the user's review (${decision.reason}): ${decision.detail}. Poll check_review; nothing was paid yet.`,
      });
      return undefined;
    }
    return executePayment(run, request, selected);
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
        return toResult(
          op,
          undefined,
          'This URL was already requested in this task; this is the original operation.',
        );
      }

      const run = track(op);
      let delivery: Delivery | undefined;
      try {
        delivery = await runPipeline(run, agent, task);
      } catch (err) {
        fail(run, err);
      }
      return toResult(deps.operations.findById(op.id)!, delivery);
    },

    listOperations: (userId, filter) => deps.operations.listByUser(userId, filter).map(toOperation),

    getOperation: (userId, operationId) => toOperation(owned(userId, operationId)),
  };
}
