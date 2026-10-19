import { parse } from 'smol-toml';
import { describe, expect, it } from 'vitest';
import {
  BLOCK_START,
  CodexConfigConflictError,
  hasManagedBlock,
  readCodexServerUrl,
  removeCodexBlock,
  upsertCodexBlock,
} from './codex';

const USER_CONFIG = `# my settings
model = "gpt-5"

[mcp_servers.github]
url = "https://api.githubcopilot.com/mcp/"
bearer_token_env_var = "GITHUB_PAT"
`;

describe('Codex config.toml', () => {
  it('writes only our block into an empty file', () => {
    expect(parse(upsertCodexBlock('', 'https://gw.example.com'))).toEqual({
      mcp_servers: {
        semanticauth: {
          url: 'https://gw.example.com/mcp',
          bearer_token_env_var: 'SEMANTICAUTH_API_KEY',
        },
      },
    });
  });

  it("keeps the user's settings and comments", () => {
    const out = upsertCodexBlock(USER_CONFIG, 'https://gw.example.com/');
    expect(out.startsWith(USER_CONFIG.trimEnd())).toBe(true);
    const parsed = parse(out) as { model: string; mcp_servers: Record<string, unknown> };
    expect(parsed.model).toBe('gpt-5');
    expect(Object.keys(parsed.mcp_servers).sort()).toEqual(['github', 'semanticauth']);
  });

  it('is idempotent and can change the URL', () => {
    const once = upsertCodexBlock(USER_CONFIG, 'https://a.example.com');
    const twice = upsertCodexBlock(once, 'https://a.example.com');
    expect(twice).toBe(once);
    expect(twice.split(BLOCK_START)).toHaveLength(2);
    const moved = upsertCodexBlock(twice, 'https://b.example.com');
    expect(readCodexServerUrl(moved)).toBe('https://b.example.com/mcp');
    expect(moved.split(BLOCK_START)).toHaveLength(2);
  });

  it('uninstall restores the original file', () => {
    const out = upsertCodexBlock(USER_CONFIG, 'https://gw.example.com');
    expect(hasManagedBlock(out)).toBe(true);
    expect(removeCodexBlock(out)).toBe(USER_CONFIG);
    expect(removeCodexBlock(upsertCodexBlock('', 'https://gw.example.com'))).toBe('');
  });

  it('refuses to overwrite a foreign [mcp_servers.semanticauth]', () => {
    const foreign = `[mcp_servers.semanticauth]\nurl = "https://someone-else/mcp"\n`;
    expect(() => upsertCodexBlock(foreign, 'https://gw.example.com')).toThrow(
      CodexConfigConflictError,
    );
  });

  it('rejects broken TOML', () => {
    expect(() => upsertCodexBlock('this is = = not toml', 'https://gw.example.com')).toThrow();
  });
});
