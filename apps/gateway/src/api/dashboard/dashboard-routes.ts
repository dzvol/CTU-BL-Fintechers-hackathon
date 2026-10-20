import { Hono } from 'hono';
import { requireUserSession, type UserEnv } from '../../auth/request-context';
import type { SessionService } from '../../auth/session-service';
import type { AccountService } from '../../services/account/account-service';
import type { ApiKeyService } from '../../services/account/api-key-service';
import type { ApprovalService } from '../../services/approval/approval-service';
import type { IntentService } from '../../services/intent/intent-service';
import type { PasskeyService } from '../../services/passkey/passkey-service';
import type { PaymentGateway } from '../../services/payment-gateway/payment-gateway';
import type { ReviewService } from '../../services/review/review-service';
import type { TaskService } from '../../services/task/task-service';
import { apiError } from '../errors';
import { createIntentsRoutes } from './intents-routes';
import { createKeysRoutes } from './keys-routes';
import { createOperationsRoutes } from './operations-routes';
import { createPasskeysRoutes } from './passkeys-routes';
import { createReviewsRoutes } from './reviews-routes';
import { createStepUpRoutes } from './step-up-routes';
import { createTasksRoutes } from './tasks-routes';

/** Mounted at /api. Everything here requires a user session; never an agent API key. */
export function createDashboardRoutes(deps: {
  sessions: SessionService;
  accounts: AccountService;
  apiKeys: ApiKeyService;
  intents: IntentService;
  tasks: TaskService;
  payments: PaymentGateway;
  reviews: ReviewService;
  passkeys: PasskeyService;
  approvals: ApprovalService;
}) {
  const app = new Hono<UserEnv>();
  app.use('*', requireUserSession(deps.sessions));

  app.get('/me', (c) => {
    const me = deps.accounts.getProfile(c.var.auth.userId);
    if (!me) return apiError(c, 401, 'unauthenticated', 'Login required');
    return c.json(me);
  });

  app.route('/keys', createKeysRoutes(deps.apiKeys));
  app.route('/intents', createIntentsRoutes(deps.intents, deps.approvals));
  app.route('/tasks', createTasksRoutes(deps.tasks));
  app.route('/operations', createOperationsRoutes(deps.payments));
  app.route('/reviews', createReviewsRoutes(deps.reviews, deps.approvals));
  app.route('/passkeys', createPasskeysRoutes(deps.passkeys));
  app.route('/step-up', createStepUpRoutes(deps.passkeys));

  return app;
}
