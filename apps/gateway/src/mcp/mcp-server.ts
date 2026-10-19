import {
  CheckReviewInputSchema,
  GetIntentStatusInputSchema,
  type McpToolName,
  PaidFetchInputSchema,
  SubmitIntentInputSchema,
} from '@semanticauth/contracts';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { AgentContext } from '../services/context';
import { ServiceError } from '../services/errors';
import type { IntentService } from '../services/intent/intent-service';
import type { PaymentGateway } from '../services/payment-gateway/payment-gateway';
import type { ReviewService } from '../services/review/review-service';
import type { TaskService } from '../services/task/task-service';

export interface McpDeps {
  intents: IntentService;
  tasks: TaskService;
  payments: PaymentGateway;
  reviews: ReviewService;
}

/** Runs a service call and turns its result or ServiceError into an MCP tool result. */
async function respond(run: () => unknown): Promise<CallToolResult> {
  try {
    const result = (await run()) as Record<string, unknown>;
    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
      structuredContent: result,
    };
  } catch (err) {
    const error =
      err instanceof ServiceError
        ? { code: err.code, message: err.message }
        : { code: 'internal_error', message: 'Internal error' };
    if (!(err instanceof ServiceError)) console.error(err);
    return { isError: true, content: [{ type: 'text', text: JSON.stringify({ error }) }] };
  }
}

/**
 * One MCP server per request (stateless), bound to the authenticated agent. Tools only validate
 * input and delegate to services: no business logic, no Jev calls, no payments here.
 */
export function createMcpServer(agent: AgentContext, deps: McpDeps): McpServer {
  const server = new McpServer({ name: 'semanticauth', version: '0.0.0' });
  const tool = (name: McpToolName) => name;

  server.registerTool(
    tool('get_intent_template'),
    {
      description:
        'Get the template for a purchase intent. Call this before submit_intent when you need to buy paid content.',
    },
    () => respond(() => deps.intents.getTemplate()),
  );

  server.registerTool(
    tool('submit_intent'),
    {
      description:
        'Propose what you need to buy and the budget. The user must approve it in the SemanticAuth dashboard before you can buy anything; show them the returned approvalUrl.',
      inputSchema: SubmitIntentInputSchema,
    },
    (input) => respond(() => deps.intents.submit(agent, input)),
  );

  server.registerTool(
    tool('get_intent_status'),
    {
      description:
        'Check whether the user approved your intent. Once approved you get a task and may call paid_fetch.',
      inputSchema: GetIntentStatusInputSchema,
    },
    ({ intentId }) => respond(() => deps.intents.getStatus(agent, intentId)),
  );

  server.registerTool(
    tool('get_task'),
    { description: 'Get your active task with its budget and how much is spent or reserved.' },
    () => respond(() => ({ task: deps.tasks.getActiveTask(agent) })),
  );

  server.registerTool(
    tool('paid_fetch'),
    {
      description:
        'Fetch a URL that may require an x402 payment. SemanticAuth checks the purchase against the approved intent and pays only if allowed. Never retry a payment that failed after it was sent.',
      inputSchema: PaidFetchInputSchema,
    },
    (input) => respond(() => deps.payments.paidFetch(agent, input)),
  );

  server.registerTool(
    tool('check_review'),
    {
      description:
        "Check the outcome of a purchase waiting for the user's review. If approved, call paid_fetch again with the same URL.",
      inputSchema: CheckReviewInputSchema,
    },
    ({ operationId }) => respond(() => deps.reviews.checkForAgent(agent, operationId)),
  );

  return server;
}
