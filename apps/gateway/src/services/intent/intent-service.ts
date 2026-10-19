import {
  formatUsdc,
  IntentProposalSchema,
  newId,
  parseUsdc,
  type ApiKeyId,
  type GetIntentStatusResult,
  type Intent,
  type IntentId,
  type IntentProposal,
  type IntentStatus,
  type IntentTemplate,
  type SubmitIntentResult,
  type UserId,
} from '@semanticauth/contracts';
import { z } from 'zod';
import type {
  IntentRecord,
  IntentRepository,
  LedgerRepository,
  Transaction,
} from '../../adapters/store';
import { remaining } from '../../domain/ledger';
import type { AgentContext } from '../context';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../errors';
import type { TaskService } from '../task/task-service';

/** How long a submitted intent waits for the user's approval. */
export const INTENT_APPROVAL_TTL_MS = 30 * 60 * 1000;

export interface IntentService {
  getTemplate(): IntentTemplate;
  /**
   * Stores the proposal as `pending_approval`. Only one pending intent and one active task may
   * exist per user, so this fails with 409 while either exists.
   */
  submit(agent: AgentContext, proposal: IntentProposal): SubmitIntentResult;
  getStatus(agent: AgentContext, intentId: IntentId): GetIntentStatusResult;
  listForUser(userId: UserId, filter: { status?: IntentStatus }): Intent[];
  getForUser(userId: UserId, intentId: IntentId): Intent;
  /** Approves and creates the active task for the key that submitted the intent. */
  approve(userId: UserId, intentId: IntentId): Intent;
  reject(userId: UserId, intentId: IntentId): Intent;

  // Internal, used by other services.
  /** The key was revoked or rotated. */
  expireForApiKey(apiKeyId: ApiKeyId, at: string): void;
}

const TEMPLATE: IntentTemplate = {
  instructions: [
    'Fill in every field of `schema` for this one task and pass the object to submit_intent.',
    'There are no defaults: derive each value from what the user asked for, and ask the user',
    'when the budget or what may be bought is unclear. Amounts are USDC strings such as "0.50".',
    'After submitting, show the user the approvalUrl: nothing can be bought until they approve.',
    'Then poll get_intent_status; once it is approved you get a task and may call paid_fetch.',
    'Only one pending intent and one active task can exist at a time.',
  ].join(' '),
  schema: z.toJSONSchema(IntentProposalSchema) as Record<string, unknown>,
};

const toIntent = (record: IntentRecord): Intent => ({
  id: record.id,
  userId: record.userId,
  apiKeyId: record.apiKeyId,
  status: record.status,
  purpose: record.purpose,
  task: record.task,
  allowedPurchases: record.allowedPurchases,
  forbidden: record.forbidden,
  budget: record.budget.toString(),
  maxPerPurchase: record.maxPerPurchase.toString(),
  plannedPurchases: record.plannedPurchases,
  taskId: record.taskId ?? undefined,
  createdAt: record.createdAt,
  expiresAt: record.expiresAt,
  decidedAt: record.decidedAt ?? undefined,
});

export function createIntentService(deps: {
  intents: IntentRepository;
  /** What the user's allocation still has left, after spent and reserved payments. */
  ledger: Pick<LedgerRepository, 'userBalance'>;
  tasks: TaskService;
  transaction: Transaction;
  /** Dashboard where the user approves intents. */
  webBaseUrl: string;
  now?: () => Date;
}): IntentService {
  const now = deps.now ?? (() => new Date());
  // Expiry is applied lazily: every read first moves overdue pending intents to `expired`.
  const expireStale = () => deps.intents.expireStale(now().toISOString());

  const owned = (userId: UserId, intentId: IntentId) => {
    const intent = deps.intents.findById(intentId);
    if (!intent) throw new NotFoundError('Intent');
    if (intent.userId !== userId) throw new ForbiddenError('Intent');
    return intent;
  };

  const pending = (intent: IntentRecord) => {
    if (intent.status !== 'pending_approval') {
      throw new ConflictError('intent_not_pending', `Intent is already ${intent.status}`);
    }
  };

  const validateAmounts = (userId: UserId, proposal: IntentProposal) => {
    const budget = parseUsdc(proposal.budgetUsdc);
    const maxPerPurchase = parseUsdc(proposal.maxPerPurchaseUsdc);
    if (budget <= 0n) throw new BadRequestError('budgetUsdc must be greater than 0');
    if (maxPerPurchase <= 0n)
      throw new BadRequestError('maxPerPurchaseUsdc must be greater than 0');
    if (maxPerPurchase > budget) {
      throw new BadRequestError('maxPerPurchaseUsdc must not exceed budgetUsdc');
    }
    const left = remaining(deps.ledger.userBalance(userId));
    if (budget > left) {
      throw new BadRequestError(
        `budgetUsdc exceeds the user's remaining allocation of ${formatUsdc(left)} USDC`,
      );
    }
    return { budget, maxPerPurchase };
  };

  return {
    getTemplate: () => TEMPLATE,

    submit(agent, proposal) {
      const { budget, maxPerPurchase } = validateAmounts(agent.userId, proposal);

      return deps.transaction(() => {
        expireStale();
        const waiting = deps.intents.findPendingByUser(agent.userId);
        if (waiting) {
          throw new ConflictError(
            'intent_pending',
            `Intent ${waiting.id} is still waiting for the user's approval`,
          );
        }
        if (deps.tasks.hasActiveTask(agent.userId)) {
          throw new ConflictError(
            'active_task_exists',
            'There is already an active task; the user must close it first',
          );
        }

        const createdAt = now();
        const intent: IntentRecord = {
          id: newId('int'),
          userId: agent.userId,
          apiKeyId: agent.apiKeyId,
          status: 'pending_approval',
          purpose: proposal.purpose,
          task: proposal.task,
          allowedPurchases: proposal.allowedPurchases,
          forbidden: proposal.forbidden,
          budget,
          maxPerPurchase,
          plannedPurchases: proposal.plannedPurchases,
          taskId: null,
          createdAt: createdAt.toISOString(),
          expiresAt: new Date(createdAt.getTime() + INTENT_APPROVAL_TTL_MS).toISOString(),
          decidedAt: null,
        };
        deps.intents.insert(intent);
        return { intentId: intent.id, status: 'pending_approval', approvalUrl: deps.webBaseUrl };
      });
    },

    getStatus(agent, intentId) {
      expireStale();
      const intent = owned(agent.userId, intentId);
      return {
        intentId: intent.id,
        status: intent.status,
        taskId: intent.taskId ?? undefined,
        budget: intent.status === 'approved' ? intent.budget.toString() : undefined,
      };
    },

    listForUser(userId, { status }) {
      expireStale();
      return deps.intents.listByUser(userId, status).map(toIntent);
    },

    getForUser(userId, intentId) {
      expireStale();
      return toIntent(owned(userId, intentId));
    },

    approve(userId, intentId) {
      return deps.transaction(() => {
        expireStale();
        const intent = owned(userId, intentId);
        pending(intent);
        const task = deps.tasks.createFromIntent(intent);
        deps.intents.decide(intent.id, 'approved', task.createdAt, task.id);
        return toIntent(deps.intents.findById(intent.id)!);
      });
    },

    reject(userId, intentId) {
      return deps.transaction(() => {
        expireStale();
        const intent = owned(userId, intentId);
        pending(intent);
        deps.intents.decide(intent.id, 'rejected', now().toISOString(), null);
        return toIntent(deps.intents.findById(intent.id)!);
      });
    },

    expireForApiKey: (apiKeyId, at) => deps.intents.expirePendingByApiKey(apiKeyId, at),
  };
}
