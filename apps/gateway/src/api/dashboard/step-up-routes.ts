import { StepUpChallengeInputSchema } from '@semanticauth/contracts';
import { Hono } from 'hono';
import type { UserEnv } from '../../auth/request-context';
import type { PasskeyService } from '../../services/passkey/passkey-service';
import { parseJsonBody } from '../validate';

/** /api/step-up: one-time passkey challenges bound to one approval or passkey change. */
export function createStepUpRoutes(passkeys: PasskeyService) {
  return new Hono<UserEnv>().post('/challenge', async (c) => {
    const { action } = await parseJsonBody(c, StepUpChallengeInputSchema);
    return c.json(await passkeys.createStepUp(c.var.auth.userId, action));
  });
}
