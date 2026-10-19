/**
 * Claude Code: the plugin is installed from a marketplace (`harness-plugin/.claude-plugin/
 * marketplace.json`). Claude Code itself keeps the API key in the OS secret store, because the
 * plugin declares it as `userConfig` with `sensitive: true`.
 *
 * This module only builds `claude plugin …` arguments; the CLI runs them.
 */
export const PLUGIN_NAME = 'semanticauth';
export const MARKETPLACE_NAME = 'semanticauth';
export const PLUGIN_ID = `${PLUGIN_NAME}@${MARKETPLACE_NAME}`;
/** Server name in the plugin's `.mcp.json`. */
export const MCP_SERVER_NAME = 'gateway';
export const DEFAULT_MARKETPLACE_SOURCE = 'dzvol/CTU-BL-Fintechers-hackathon';

export type InstallScope = 'user' | 'project' | 'local';

/** Full tool name as the agent sees it in Claude Code. */
export function claudeToolName(tool: string): string {
  return `mcp__plugin_${PLUGIN_NAME}_${MCP_SERVER_NAME}__${tool}`;
}

export function marketplaceAddArgs(source: string): string[] {
  return ['plugin', 'marketplace', 'add', source];
}

export function marketplaceRemoveArgs(): string[] {
  return ['plugin', 'marketplace', 'remove', MARKETPLACE_NAME];
}

export function installArgs(scope: InstallScope = 'user'): string[] {
  return ['plugin', 'install', PLUGIN_ID, '--scope', scope];
}

/** Values go through stdin, never argv: arguments are visible in the process list. */
export function configureArgs(): string[] {
  return ['plugin', 'configure', PLUGIN_ID, '--values-stdin'];
}

export function configureStdin(values: { api_key?: string; gateway_url?: string }): string {
  return JSON.stringify(
    Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined)),
  );
}

export function uninstallArgs(scope: InstallScope = 'user'): string[] {
  return ['plugin', 'uninstall', PLUGIN_ID, '--scope', scope];
}

export function listArgs(): string[] {
  return ['plugin', 'list', '--json'];
}

/** Reads `claude plugin list --json` output; tolerates both an array and `{ plugins: [...] }`. */
export function findPluginInList(jsonText: string): { installed: boolean; enabled?: boolean } {
  let data: unknown;
  try {
    data = JSON.parse(jsonText);
  } catch {
    return { installed: jsonText.includes(PLUGIN_ID) };
  }
  const items: unknown[] = Array.isArray(data)
    ? data
    : typeof data === 'object' && data !== null && 'plugins' in data && Array.isArray(data.plugins)
      ? data.plugins
      : [];
  for (const item of items) {
    if (typeof item !== 'object' || item === null) continue;
    const rec = item as Record<string, unknown>;
    const ident = String(rec.id ?? rec.name ?? '');
    if (ident === PLUGIN_ID || ident === PLUGIN_NAME) {
      return {
        installed: true,
        enabled: typeof rec.enabled === 'boolean' ? rec.enabled : undefined,
      };
    }
  }
  return { installed: false };
}
