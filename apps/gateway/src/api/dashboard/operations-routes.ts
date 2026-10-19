import {
  OperationIdSchema,
  TaskIdSchema,
  type ListResponse,
  type Operation,
} from '@semanticauth/contracts';
import { Hono } from 'hono';
import type { UserEnv } from '../../auth/request-context';
import type { PaymentGateway } from '../../services/payment-gateway/payment-gateway';
import { parse } from '../validate';

/** /api/operations: paid_fetch history with verdicts and settlements. */
export function createOperationsRoutes(payments: PaymentGateway) {
  return new Hono<UserEnv>()
    .get('/', (c) => {
      const taskId = parse(TaskIdSchema.optional(), c.req.query('taskId'));
      return c.json<ListResponse<Operation>>({
        items: payments.listOperations(c.var.auth.userId, { taskId }),
      });
    })
    .get('/:id', (c) =>
      c.json(payments.getOperation(c.var.auth.userId, parse(OperationIdSchema, c.req.param('id')))),
    );
}
