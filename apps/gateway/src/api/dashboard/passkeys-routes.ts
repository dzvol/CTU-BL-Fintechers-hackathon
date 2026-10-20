import {
  PasskeyIdSchema,
  PasskeyRegistrationInputSchema,
  PasskeyRegistrationOptionsInputSchema,
  RemovePasskeyInputSchema,
  type ListResponse,
  type Passkey,
} from '@semanticauth/contracts';
import { Hono } from 'hono';
import type { UserEnv } from '../../auth/request-context';
import type { PasskeyService } from '../../services/passkey/passkey-service';
import { parse, parseJsonBody, parseOptionalJsonBody } from '../validate';

/** /api/passkeys: the passkeys that confirm the user's approvals. */
export function createPasskeysRoutes(passkeys: PasskeyService) {
  return new Hono<UserEnv>()
    .get('/', (c) => c.json<ListResponse<Passkey>>({ items: passkeys.list(c.var.auth.userId) }))
    .post('/registration/options', async (c) => {
      const { proof } = await parseOptionalJsonBody(c, PasskeyRegistrationOptionsInputSchema);
      return c.json(await passkeys.startRegistration(c.var.auth, proof));
    })
    .post('/registration/verify', async (c) => {
      const input = await parseJsonBody(c, PasskeyRegistrationInputSchema);
      return c.json(await passkeys.finishRegistration(c.var.auth.userId, input), 201);
    })
    .delete('/:id', async (c) => {
      const id = parse(PasskeyIdSchema, c.req.param('id'));
      const { proof } = await parseJsonBody(c, RemovePasskeyInputSchema);
      await passkeys.remove(c.var.auth.userId, id, proof);
      return c.body(null, 204);
    });
}
