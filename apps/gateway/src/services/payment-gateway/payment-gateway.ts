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
} from '@semanticauth/contracts';
import type { JevClient } from '../../adapters/jev/jev-client';
import type {
  OperationPatch,
  OperationRecord,
  OperationRepository,
  Transaction,
} from '../../adapters/store';
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
// Placeholders for member 3's components (x402 transport, normalizer, ledger, signer,
// ChainReader). They mark where those plug in; until then the operation is blocked, fail-closed.

/** What the orchestrator needs from fetching the URL. Replace with the transport/normalizer output. */
type FetchedResource =
  | { kind: 'free'; content: string; contentType?: string }
  | { kind: 'payment_required'; offer: NormalizedOffer; merchantText: unknown };

async function fetchResource(_url: string): Promise<FetchedResource> {
  // TODO(member 3): egress check, then GET via the x402 transport. On 2xx return the content.
  // On 402 build the NormalizedOffer (unsupported profile → BLOCK unsupported_offer) and the
  // Screen inputs from the normalizer (mapPaymentRequired).
  throw new NotImplementedError('x402 transport');
}

async function executePayment(_run: Run, _offer: NormalizedOffer): Promise<Delivery> {
  // TODO(member 3), in this order, each step moving the operation forward:
  //   ledger: atomic reservation          requested → reserved  (no funds → BLOCK insufficient_allocation)
  //   signer: EIP-3009 authorization      reserved → prepared
  //   persist the exact authorization     prepared → issued     (BEFORE it leaves the gateway)
  //   x402 request with payment header    issued → submitted
  //   ChainReader verifies settlement     submitted → settled   (unclear → unknown)
  //   hand the content to the agent       settled → delivered / delivery_failed
  throw new NotImplementedError('payment execution');
}
// ---------------------------------------------------------------------------------------------

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
  tasks: TaskService;
  intents: IntentService;
  transaction: Transaction;
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

  /** Fail closed: blocked before the authorization was issued, unknown (counts as spent) after. */
  function fail(run: Run, err: unknown) {
    const target = failureState(run.state);
    if (!target) throw err;
    if (!(err instanceof NotImplementedError)) console.error(`Operation ${run.id} failed:`, err);
    const cause = err instanceof NotImplementedError ? err.message : 'Internal error';
    run.move(
      target,
      target === 'blocked'
        ? { verdict: 'BLOCK', reason: 'internal_error', message: `${cause}. Nothing was paid.` }
        : {
            message: `${cause}. The payment outcome is unknown and counts as spent; do not retry.`,
          },
    );
  }

  /** Fetch → evaluate → pay. Any throw is turned into a fail-closed state by `fail`. */
  async function runPipeline(
    run: Run,
    agent: AgentContext,
    task: Task,
  ): Promise<Delivery | undefined> {
    const intent = deps.intents.getForUser(agent.userId, task.intentId);

    const fetched = await fetchResource(run.url);
    if (fetched.kind === 'free') {
      run.move('delivered', {
        verdict: 'ALLOW',
        reason: 'free_content',
        message: 'Free content, no payment needed.',
      });
      return fetched;
    }

    const { offer } = fetched;
    const decision = await evaluateOffer(
      { policy: deps.policy, jev: deps.jev },
      { offer, merchantText: fetched.merchantText, intent, task },
    );

    if (decision.verdict === 'BLOCK') {
      run.move('blocked', {
        ...decision,
        offer,
        message: `Blocked (${decision.reason}). Nothing was paid.`,
      });
      return undefined;
    }
    if (decision.verdict === 'REVIEW') {
      // TODO(review): open a review for the user via ReviewService (expires after REVIEW_TTL_MS).
      run.move('awaiting_review', {
        ...decision,
        offer,
        message: `Waiting for the user's review (${decision.reason}). Poll check_review; nothing was paid yet.`,
      });
      return undefined;
    }
    return executePayment(run, offer);
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
