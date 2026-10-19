import { codex, isWellFormedApiKey, type claudeCode } from '@semanticauth/agent';
import { loadApiKey, resolveGatewayUrl, saveConfig } from '../credentials/credential-store';
import { commandExists, runInteractive } from '../exec';
import { installClaudeCode, uninstallClaudeCode } from '../installers/claude-code';
import { installCodex, uninstallCodex } from '../installers/codex';
import { CliError, hint, warn } from '../ui';
import { validateGatewayUrl } from './config';

const HARNESSES = ['claude-code', 'codex', 'cursor'] as const;
export type Harness = (typeof HARNESSES)[number];

function assertHarness(h: string): asserts h is Harness {
  if (!(HARNESSES as readonly string[]).includes(h)) {
    throw new CliError(`Unknown harness "${h}".`, 'Supported: claude-code, codex.');
  }
}

const CURSOR_HINT =
  'Manually: add the HTTP server GATEWAY_URL/mcp with header "Authorization: Bearer API_KEY" to ~/.cursor/mcp.json.';

export async function installCommand(
  harness: string,
  opts: { gateway?: string; source?: string; scope?: claudeCode.InstallScope },
): Promise<void> {
  assertHarness(harness);
  if (opts.gateway) saveConfig({ gateway_url: validateGatewayUrl(opts.gateway) });
  const gatewayUrl = resolveGatewayUrl(opts.gateway);

  if (harness === 'claude-code') {
    const key = loadApiKey();
    const valid = key && isWellFormedApiKey(key.key) ? key.key : undefined;
    if (key && !valid) warn('The stored key is malformed; not handing it to Claude Code.');
    await installClaudeCode({ gatewayUrl, apiKey: valid, source: opts.source, scope: opts.scope });
    return;
  }
  if (harness === 'codex') {
    installCodex({ gatewayUrl });
    if (!loadApiKey()) hint('Store the key too: `semanticauth auth`.');
    return;
  }
  throw new CliError('Cursor is not supported yet.', CURSOR_HINT);
}

export async function uninstallCommand(
  harness: string,
  opts: { scope?: claudeCode.InstallScope },
): Promise<void> {
  assertHarness(harness);
  if (harness === 'claude-code') return uninstallClaudeCode(opts.scope);
  if (harness === 'codex') return uninstallCodex();
  throw new CliError('Cursor is not supported yet.');
}

/** `semanticauth run codex …`: Codex only reads the key from an environment variable. */
export async function runCommand(harness: string, args: string[]): Promise<number> {
  if (harness !== 'codex') {
    throw new CliError(
      '`run` only supports codex.',
      'Claude Code keeps the key itself; just run `claude`.',
    );
  }
  if (!commandExists('codex')) {
    throw new CliError('`codex` command not found.', 'Install it: npm i -g @openai/codex');
  }
  const key = loadApiKey();
  if (!key || !isWellFormedApiKey(key.key)) {
    throw new CliError('No valid API key.', 'Run `semanticauth auth`.');
  }
  return runInteractive('codex', args, { ...process.env, [codex.CODEX_API_KEY_ENV]: key.key });
}
