import {
  ApproveInputSchema,
  IntentIdSchema,
  IntentStatusSchema,
  type Intent,
  type ListResponse,
} from '@semanticauth/contracts';
import { Hono } from 'hono';
import type { UserEnv } from '../../auth/request-context';
import type { ApprovalService } from '../../services/approval/approval-service';
import type { IntentService } from '../../services/intent/intent-service';
import { parse, parseOptionalJsonBody } from '../validate';

/** /api/intents: intents proposed by the user's agents, approved or rejected here. */
export function createIntentsRoutes(intents: IntentService, approvals: ApprovalService) {
  return new Hono<UserEnv>()
    .get('/', (c) => {
      const status = parse(IntentStatusSchema.optional(), c.req.query('status'));
      return c.json<ListResponse<Intent>>({
        items: intents.listForUser(c.var.auth.userId, { status }),
      });
    })
    .get('/:id', (c) =>
      c.json(intents.getForUser(c.var.auth.userId, parse(IntentIdSchema, c.req.param('id')))),
    )
    .post('/:id/approve', async (c) => {
      const id = parse(IntentIdSchema, c.req.param('id'));
      const { proof } = await parseOptionalJsonBody(c, ApproveInputSchema);
      return c.json(await approvals.approveIntent(c.var.auth.userId, id, proof));
    })
    .post('/:id/reject', (c) =>
      c.json(intents.reject(c.var.auth.userId, parse(IntentIdSchema, c.req.param('id')))),
    );
}
