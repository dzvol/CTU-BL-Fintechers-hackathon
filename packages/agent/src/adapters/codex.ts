/**
 * Codex: generates and edits `~/.codex/config.toml`.
 *
 * We only write a delimited block between markers, so the user's comments and the rest of their
 * config stay untouched and `uninstall` can remove exactly that block.
 *
 * Codex doesn't accept a bearer token inline for Streamable HTTP servers, only the name of an
 * environment variable, hence `bearer_token_env_var` + `semanticauth run codex`.
 */
import { parse } from 'smol-toml';
import { mcpEndpoint } from '../gateway-client';

export const MCP_SERVER_NAME = 'semanticauth';
export const CODEX_API_KEY_ENV = 'SEMANTICAUTH_API_KEY';
export const BLOCK_START = '# >>> semanticauth (managed by `semanticauth install codex`) >>>';
export const BLOCK_END = '# <<< semanticauth <<<';

export class CodexConfigConflictError extends Error {
  constructor() {
    super(
      `~/.codex/config.toml already has [mcp_servers.${MCP_SERVER_NAME}] that semanticauth ` +
        'does not manage. Remove it and run install again.',
    );
    this.name = 'CodexConfigConflictError';
  }
}

export function codexBlock(gatewayUrl: string): string {
  return [
    BLOCK_START,
    `[mcp_servers.${MCP_SERVER_NAME}]`,
    `url = ${JSON.stringify(mcpEndpoint(gatewayUrl))}`,
    `bearer_token_env_var = ${JSON.stringify(CODEX_API_KEY_ENV)}`,
    BLOCK_END,
  ].join('\n');
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const BLOCK_RE = new RegExp(`\\n*${escapeRe(BLOCK_START)}[\\s\\S]*?${escapeRe(BLOCK_END)}\\n?`);

type CodexConfig = { mcp_servers?: Record<string, { url?: unknown }> };

export function hasManagedBlock(configText: string): boolean {
  return BLOCK_RE.test(configText);
}

/** Removes our block if present and returns the rest of the file unchanged. */
export function removeCodexBlock(configText: string): string {
  if (!hasManagedBlock(configText)) return configText;
  return configText
    .replace(BLOCK_RE, '\n')
    .replace(/\n{3,}$/, '\n')
    .replace(/^\n+/, '');
}

/**
 * Inserts or replaces our block. Idempotent: calling it twice leaves one block. Throws
 * CodexConfigConflictError if the user has their own [mcp_servers.semanticauth], and throws on
 * invalid TOML so the caller never writes a broken file.
 */
export function upsertCodexBlock(configText: string, gatewayUrl: string): string {
  const base = removeCodexBlock(configText);
  const parsed = base.trim() ? (parse(base) as CodexConfig) : {};
  if (parsed.mcp_servers && MCP_SERVER_NAME in parsed.mcp_servers) {
    throw new CodexConfigConflictError();
  }
  const trimmed = base.replace(/\s+$/, '');
  const result = `${trimmed ? `${trimmed}\n\n` : ''}${codexBlock(gatewayUrl)}\n`;
  parse(result);
  return result;
}

/** Server URL from the config, if our server is configured. */
export function readCodexServerUrl(configText: string): string | undefined {
  try {
    const url = (parse(configText) as CodexConfig).mcp_servers?.[MCP_SERVER_NAME]?.url;
    return typeof url === 'string' ? url : undefined;
  } catch {
    return undefined;
  }
}
