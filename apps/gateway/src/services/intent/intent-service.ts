import type {
  GetIntentStatusResult,
  Intent,
  IntentId,
  IntentProposal,
  IntentStatus,
  IntentTemplate,
  SubmitIntentResult,
  UserId,
} from '@semanticauth/contracts';
import type { AgentContext } from '../context';
import { notImplemented } from '../errors';

/** How long a submitted intent waits for the user's approval. */
export const INTENT_APPROVAL_TTL_MS = 30 * 60 * 1000;

export interface IntentService {
  getTemplate(): IntentTemplate;
  /** Stores the proposal as `pending_approval`. Never touches an existing active task. */
  submit(agent: AgentContext, proposal: IntentProposal): SubmitIntentResult;
  getStatus(agent: AgentContext, intentId: IntentId): GetIntentStatusResult;
  listForUser(userId: UserId, filter: { status?: IntentStatus }): Intent[];
  getForUser(userId: UserId, intentId: IntentId): Intent;
  /**
   * Approves and creates the active task for the submitting API key. Fails with 409
   * `active_task_exists` while that key still has an active task.
   */
  approve(userId: UserId, intentId: IntentId): Intent;
  reject(userId: UserId, intentId: IntentId): Intent;
}

// TODO: implement (IntentService). Until then every call answers 501.
export function createIntentService(): IntentService {
  return {
    getTemplate: notImplemented('intent.getTemplate'),
    submit: notImplemented('intent.submit'),
    getStatus: notImplemented('intent.getStatus'),
    listForUser: notImplemented('intent.listForUser'),
    getForUser: notImplemented('intent.getForUser'),
    approve: notImplemented('intent.approve'),
    reject: notImplemented('intent.reject'),
  };
}
