import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { Hono } from 'hono';
import { type AgentEnv, requireAgentKey } from '../auth/request-context';
import type { RateLimiter } from '../auth/rate-limit';
import type { AccountService } from '../services/account/account-service';
import type { ApiKeyService } from '../services/account/api-key-service';
import { apiError } from '../api/errors';
import { createMcpServer, type McpDeps } from './mcp-server';

/**
 * Mounted at /mcp. Streamable HTTP in stateless mode: every POST is self-contained, so there are
 * no MCP sessions to track (one API key = one agent run).
 */
export function createMcpRoutes(
  deps: McpDeps & { accounts: AccountService; apiKeys: ApiKeyService; rateLimiter: RateLimiter },
) {
  const app = new Hono<AgentEnv>();
  app.use('*', requireAgentKey(deps.apiKeys, deps.accounts, deps.rateLimiter));

  app.post('/', async (c) => {
    const server = createMcpServer(c.var.auth, deps);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await server.connect(transport);
    try {
      return await transport.handleRequest(c.req.raw);
    } finally {
      await server.close();
    }
  });

  // No server-initiated streams or sessions in stateless mode.
  app.on(['GET', 'DELETE'], '/', (c) =>
    apiError(c, 405, 'method_not_allowed', 'Use POST for MCP requests'),
  );

  return app;
}
