import {
  IntentIdSchema,
  IntentStatusSchema,
  type Intent,
  type ListResponse,
} from '@semanticauth/contracts';
import { Hono } from 'hono';
import type { UserEnv } from '../../auth/request-context';
import type { IntentService } from '../../services/intent/intent-service';
import { parse } from '../validate';

/** /api/intents: intents proposed by the user's agents, approved or rejected here. */
export function createIntentsRoutes(intents: IntentService) {
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
    .post('/:id/approve', (c) =>
      c.json(intents.approve(c.var.auth.userId, parse(IntentIdSchema, c.req.param('id')))),
    )
    .post('/:id/reject', (c) =>
      c.json(intents.reject(c.var.auth.userId, parse(IntentIdSchema, c.req.param('id')))),
    );
}
