import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { MCP_TOOLS } from '@semanticauth/contracts';
import { describe, expect, it } from 'vitest';
import { asUser, createAgentKey, createTestApp, type TestApp } from './helpers';

/** A real MCP client talking to the in-process app over Streamable HTTP. */
async function connect(app: TestApp, key: string) {
  const client = new Client({ name: 'test-agent', version: '0.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL('http://gateway.test/mcp'), {
    fetch: async (url, init) => app.request(url.toString(), init),
    requestInit: { headers: { authorization: `Bearer ${key}` } },
  });
  await client.connect(transport);
  return client;
}

describe('MCP server', () => {
  it('lists every tool from the contract', async () => {
    const app = createTestApp();
    const { key } = await createAgentKey(app);
    const client = await connect(app, key);

    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([...MCP_TOOLS].sort());
    await client.close();
  });

  it('returns service errors as tool errors (501 stubs for now)', async () => {
    const app = createTestApp();
    const { key } = await createAgentKey(app);
    const client = await connect(app, key);

    const result = await client.callTool({
      name: 'paid_fetch',
      arguments: { url: 'https://merchant.example/data' },
    });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('not_implemented');
    await client.close();
  });

  it('validates tool input before calling services', async () => {
    const app = createTestApp();
    const { key } = await createAgentKey(app);
    const client = await connect(app, key);

    const result = await client.callTool({ name: 'paid_fetch', arguments: { url: 'not a url' } });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).not.toContain('not_implemented');
    await client.close();
  });

  it('rejects missing and revoked keys', async () => {
    const app = createTestApp();
    const { key, apiKeyId, sessionCookie } = await createAgentKey(app);

    await expect(connect(app, 'sa_wrong')).rejects.toThrow();

    await asUser(app, sessionCookie, `/api/keys/${apiKeyId}`, { method: 'DELETE' });
    await expect(connect(app, key)).rejects.toThrow();
  });
});
