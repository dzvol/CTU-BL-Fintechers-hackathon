import { claudeCode } from '@semanticauth/agent';
import { commandExists, run } from '../exec';
import { harnessPluginDir } from '../paths';
import { CliError, hint, info, ok, warn } from '../ui';

export interface ClaudeInstallOptions {
  gatewayUrl: string;
  apiKey?: string;
  /** Marketplace source; defaults to this checkout's harness-plugin/. */
  source?: string;
  scope?: claudeCode.InstallScope;
}

const ALREADY = /already (installed|exists|added)/i;
const NOT_FOUND = /not installed|not found/i;

function requireClaude(): void {
  if (!commandExists('claude')) {
    throw new CliError(
      '`claude` command not found.',
      'Install Claude Code, or run inside it:\n' +
        `    /plugin marketplace add ${harnessPluginDir()}\n` +
        `    /plugin install ${claudeCode.PLUGIN_ID}`,
    );
  }
}

export async function installClaudeCode(opts: ClaudeInstallOptions): Promise<void> {
  requireClaude();
  const source = opts.source ?? harnessPluginDir();
  info(`Installing ${claudeCode.PLUGIN_ID} from ${source} …`);

  const market = await run('claude', claudeCode.marketplaceAddArgs(source));
  const marketOut = `${market.stdout}\n${market.stderr}`;
  if (market.code !== 0 && !ALREADY.test(marketOut)) {
    throw new CliError(`Adding the marketplace failed:\n${marketOut.trim()}`);
  }

  const res = await run('claude', claudeCode.installArgs(opts.scope));
  const output = `${res.stdout}\n${res.stderr}`;
  if (res.code !== 0 && !ALREADY.test(output)) {
    throw new CliError(
      `Plugin installation failed:\n${output.trim()}`,
      'A private repo needs git credentials; or pass --source with the path to harness-plugin/.',
    );
  }
  ok(ALREADY.test(output) ? 'Plugin was already installed.' : 'Plugin installed.');

  const values = { gateway_url: opts.gatewayUrl, api_key: opts.apiKey };
  const conf = await run('claude', claudeCode.configureArgs(), {
    input: claudeCode.configureStdin(values),
  });
  if (conf.code !== 0) {
    warn('Could not save the plugin settings automatically.');
    hint(
      'Claude Code asks for them when the plugin is enabled, or use /plugin → SemanticAuth → Configure.',
    );
  } else if (opts.apiKey) {
    ok('API key handed to Claude Code (kept in the OS secret store).');
  } else {
    warn('No API key set yet. Claude Code will ask, or run `semanticauth auth` and install again.');
  }
  ok(`Gateway: ${opts.gatewayUrl}`);
  hint('In a running session: /reload-plugins, then /mcp should list plugin:semanticauth:gateway.');
}

export async function uninstallClaudeCode(scope: claudeCode.InstallScope = 'user'): Promise<void> {
  requireClaude();
  const res = await run('claude', claudeCode.uninstallArgs(scope));
  if (res.code !== 0) {
    const out = `${res.stdout}\n${res.stderr}`.trim();
    if (!NOT_FOUND.test(out)) throw new CliError(`Uninstall failed:\n${out}`);
    warn('Plugin was not installed.');
  } else {
    ok('Plugin removed from Claude Code.');
  }

  const market = await run('claude', claudeCode.marketplaceRemoveArgs());
  if (market.code === 0) ok(`Marketplace ${claudeCode.MARKETPLACE_NAME} removed.`);
  else if (!NOT_FOUND.test(`${market.stdout}\n${market.stderr}`)) {
    warn(`Could not remove marketplace ${claudeCode.MARKETPLACE_NAME}; remove it via /plugin.`);
  }
}

export async function claudePluginStatus(): Promise<{
  claudeFound: boolean;
  installed: boolean;
  enabled?: boolean;
}> {
  if (!commandExists('claude')) return { claudeFound: false, installed: false };
  const res = await run('claude', claudeCode.listArgs());
  return { claudeFound: true, ...claudeCode.findPluginInList(res.stdout) };
}
