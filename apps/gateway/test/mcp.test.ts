import { MCP_TOOLS } from '@semanticauth/contracts';
import { describe, expect, it } from 'vitest';
import { asUser, connectMcp as connect, createAgentKey, createTestApp } from './helpers';

describe('MCP server', () => {
  it('lists every tool from the contract', async () => {
    const app = createTestApp();
    const { key } = await createAgentKey(app);
    const client = await connect(app, key);

    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([...MCP_TOOLS].sort());
    await client.close();
  });

  it('returns service errors as tool errors', async () => {
    const app = createTestApp();
    const { key } = await createAgentKey(app);
    const client = await connect(app, key);

    const result = await client.callTool({
      name: 'check_review',
      arguments: { operationId: 'op_00000000-0000-0000-0000-000000000000' },
    });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('not_found');
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
