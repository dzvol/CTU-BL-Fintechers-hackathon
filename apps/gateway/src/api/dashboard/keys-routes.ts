import {
  ApiKeyIdSchema,
  CreateApiKeyInputSchema,
  type ApiKey,
  type ListResponse,
} from '@semanticauth/contracts';
import { Hono } from 'hono';
import type { UserEnv } from '../../auth/request-context';
import type { ApiKeyService } from '../../services/account/api-key-service';
import { parse, parseJsonBody } from '../validate';

/** /api/keys: agent API keys of the logged-in user. */
export function createKeysRoutes(apiKeys: ApiKeyService) {
  return new Hono<UserEnv>()
    .get('/', (c) => c.json<ListResponse<ApiKey>>({ items: apiKeys.list(c.var.auth.userId) }))
    .post('/', async (c) => {
      const { name } = await parseJsonBody(c, CreateApiKeyInputSchema);
      return c.json(apiKeys.create(c.var.auth.userId, name), 201);
    })
    .delete('/:id', (c) => {
      const id = parse(ApiKeyIdSchema, c.req.param('id'));
      return c.json(apiKeys.revoke(c.var.auth.userId, id));
    });
}
