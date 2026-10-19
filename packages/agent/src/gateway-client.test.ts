import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { MCP_TOOLS, type McpToolName } from '@semanticauth/contracts';
import { describe, expect, it } from 'vitest';
import {
  GatewayAuthError,
  GatewayClient,
  GatewayProtocolError,
  GatewayUnreachableError,
  mcpEndpoint,
  whoami,
} from './gateway-client';

const KEY = 'sa_testkeytestkeytestkeytestkey';
const GATEWAY = 'http://gateway.test';
const TASK = {
  id: 'task_00000000-0000-4000-8000-000000000001',
  intentId: 'int_00000000-0000-4000-8000-000000000001',
  userId: 'usr_00000000-0000-4000-8000-000000000001',
  apiKeyId: 'key_00000000-0000-4000-8000-000000000001',
  status: 'active',
  budget: '500000',
  spent: '100000',
  reserved: '0',
  createdAt: '2026-10-19T10:00:00.000Z',
};

type Reply = Record<string, unknown> | { error: { code: string; message: string } };

/** Minimal stand-in for the gateway: same auth, same transport, canned tool results. */
function fakeGateway(replies: Partial<Record<McpToolName, Reply>>): typeof fetch {
  return async (input, init) => {
    const req = new Request(input, init);
    if (req.headers.get('authorization') !== `Bearer ${KEY}`) {
      return Response.json(
        { error: { code: 'invalid_api_key', message: 'nope' } },
        { status: 401 },
      );
    }
    const path = new URL(req.url).pathname;
    if (path === '/v1/whoami') {
      return Response.json({ userId: TASK.userId, apiKeyId: TASK.apiKeyId, email: 'a@b.cz' });
    }
    if (path !== '/mcp') return new Response('not found', { status: 404 });

    const server = new McpServer({ name: 'fake-gateway', version: '0.0.0' });
    for (const name of MCP_TOOLS) {
      server.registerTool(name, { description: name }, (): CallToolResult => {
        const reply = replies[name] ?? { error: { code: 'not_implemented', message: name } };
        const text = JSON.stringify(reply);
        return 'error' in reply
          ? { isError: true, content: [{ type: 'text', text }] }
          : { content: [{ type: 'text', text }], structuredContent: reply };
      });
    }
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await server.connect(transport);
    try {
      return await transport.handleRequest(req);
    } finally {
      await server.close();
    }
  };
}

const unreachable: typeof fetch = () => Promise.reject(new TypeError('fetch failed'));

describe('mcpEndpoint', () => {
  it('normalizes trailing slashes and an explicit /mcp', () => {
    expect(mcpEndpoint('https://gw.example.com/')).toBe('https://gw.example.com/mcp');
    expect(mcpEndpoint('https://gw.example.com/mcp')).toBe('https://gw.example.com/mcp');
  });
});

describe('whoami', () => {
  it('returns the key owner', async () => {
    const me = await whoami({ gatewayUrl: GATEWAY, apiKey: KEY, fetch: fakeGateway({}) });
    expect(me.email).toBe('a@b.cz');
  });

  it('maps 401 and network failures to typed errors', async () => {
    await expect(
      whoami({ gatewayUrl: GATEWAY, apiKey: 'sa_wrong', fetch: fakeGateway({}) }),
    ).rejects.toBeInstanceOf(GatewayAuthError);
    await expect(
      whoami({ gatewayUrl: GATEWAY, apiKey: KEY, fetch: unreachable }),
    ).rejects.toBeInstanceOf(GatewayUnreachableError);
  });
});

describe('GatewayClient', () => {
  it('lists the contract tools and validates results', async () => {
    const client = await GatewayClient.connect({
      gatewayUrl: GATEWAY,
      apiKey: KEY,
      fetch: fakeGateway({ get_task: { task: TASK } }),
    });
    expect((await client.listToolNames()).sort()).toEqual([...MCP_TOOLS].sort());
    expect(await client.call('get_task')).toEqual({ ok: true, result: { task: TASK } });
    await client.close();
  });

  it('returns tool errors as data', async () => {
    const client = await GatewayClient.connect({
      gatewayUrl: GATEWAY,
      apiKey: KEY,
      fetch: fakeGateway({}),
    });
    expect(await client.call('paid_fetch', { url: 'https://m.example/x' })).toEqual({
      ok: false,
      error: { code: 'not_implemented', message: 'paid_fetch' },
    });
    await client.close();
  });

  it('rejects results that break the contract', async () => {
    const client = await GatewayClient.connect({
      gatewayUrl: GATEWAY,
      apiKey: KEY,
      fetch: fakeGateway({ get_task: { task: { ...TASK, budget: 0.5 } } }),
    });
    await expect(client.call('get_task')).rejects.toBeInstanceOf(GatewayProtocolError);
    await client.close();
  });

  it('maps a rejected key and an unreachable gateway to typed errors', async () => {
    await expect(
      GatewayClient.connect({ gatewayUrl: GATEWAY, apiKey: 'sa_wrong', fetch: fakeGateway({}) }),
    ).rejects.toBeInstanceOf(GatewayAuthError);
    await expect(
      GatewayClient.connect({ gatewayUrl: GATEWAY, apiKey: KEY, fetch: unreachable }),
    ).rejects.toBeInstanceOf(GatewayUnreachableError);
  });
});
