import type {
  Operation,
  OperationId,
  PaidFetchInput,
  PaidFetchResult,
  TaskId,
  UserId,
} from '@semanticauth/contracts';
import type { AgentContext } from '../context';
import { notImplemented } from '../errors';

export interface PaymentGateway {
  /** The whole `paid_fetch` workflow for the agent's active task. */
  paidFetch(agent: AgentContext, input: PaidFetchInput): Promise<PaidFetchResult>;
  listOperations(userId: UserId, filter: { taskId?: TaskId }): Operation[];
  getOperation(userId: UserId, operationId: OperationId): Operation;
}

// TODO: implement (PaymentGateway orchestrator). Until then every call answers 501.
export function createPaymentGateway(): PaymentGateway {
  return {
    paidFetch: async () => notImplemented('payments.paidFetch')(),
    listOperations: notImplemented('payments.listOperations'),
    getOperation: notImplemented('payments.getOperation'),
  };
}
