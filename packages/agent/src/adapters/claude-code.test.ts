import { describe, expect, it } from 'vitest';
import { claudeToolName, configureArgs, configureStdin, findPluginInList } from './claude-code';

describe('Claude Code adapter', () => {
  it('names tools the way Claude Code exposes plugin MCP servers', () => {
    expect(claudeToolName('paid_fetch')).toBe('mcp__plugin_semanticauth_gateway__paid_fetch');
  });

  it('passes the API key through stdin, never through argv', () => {
    const key = 'sa_secretsecretsecretsecret';
    expect(configureArgs().join(' ')).not.toContain(key);
    expect(JSON.parse(configureStdin({ api_key: key, gateway_url: undefined }))).toEqual({
      api_key: key,
    });
  });

  it('finds the plugin in both list formats', () => {
    expect(findPluginInList('[{"id":"semanticauth@semanticauth","enabled":false}]')).toEqual({
      installed: true,
      enabled: false,
    });
    expect(findPluginInList('{"plugins":[{"name":"semanticauth"}]}')).toEqual({
      installed: true,
      enabled: undefined,
    });
    expect(findPluginInList('[{"id":"other@market"}]')).toEqual({ installed: false });
    expect(findPluginInList('semanticauth@semanticauth (enabled)')).toEqual({ installed: true });
  });
});
