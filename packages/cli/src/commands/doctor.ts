import {
  GatewayAuthError,
  GatewayClient,
  GatewayUnreachableError,
  isWellFormedApiKey,
  maskApiKey,
  whoami,
} from '@semanticauth/agent';
import { formatUsdc, MCP_TOOLS } from '@semanticauth/contracts';
import { API_KEY_ENV, loadApiKey, resolveGatewayUrl } from '../credentials/credential-store';
import { commandExists } from '../exec';
import { claudePluginStatus } from '../installers/claude-code';
import { codexStatus } from '../installers/codex';
import { bold, fail, hint, ok, warn } from '../ui';

const MIN_NODE_MAJOR = 22;

async function checkGateway(
  gatewayUrl: string,
  apiKey: string,
  bad: (msg: string, fix: string) => void,
): Promise<void> {
  try {
    const me = await whoami({ gatewayUrl, apiKey });
    ok(`${gatewayUrl} reachable, key accepted (${me.email})`);
  } catch (err) {
    if (err instanceof GatewayAuthError) {
      bad(
        'The gateway rejected the key (invalid or revoked).',
        'Create a new key in the dashboard and run `semanticauth auth`.',
      );
    } else if (err instanceof GatewayUnreachableError) {
      bad(
        `Gateway ${gatewayUrl} is not reachable.`,
        'Check the URL (`semanticauth config get`); locally run `npm run dev:gateway`.',
      );
    } else {
      bad(`Unexpected error: ${(err as Error).message}`, 'Send this output to the gateway team.');
    }
    return;
  }

  const client = await GatewayClient.connect({
    gatewayUrl,
    apiKey,
    clientName: 'semanticauth-doctor',
  });
  try {
    const tools = await client.listToolNames();
    const missing = MCP_TOOLS.filter((t) => !tools.includes(t));
    if (missing.length) {
      bad(
        `The gateway does not expose: ${missing.join(', ')}.`,
        'Gateway and plugin disagree on the contract; tell the gateway team.',
      );
    } else {
      ok(`All ${MCP_TOOLS.length} MCP tools available`);
    }

    const task = await client.call('get_task');
    if (!task.ok) {
      warn(`get_task answered ${task.error.code}: ${task.error.message}`);
    } else if (task.result.task) {
      const { budget, spent, reserved } = task.result.task;
      const remaining = BigInt(budget) - BigInt(spent) - BigInt(reserved);
      ok(`Active task, ${formatUsdc(remaining)} of ${formatUsdc(budget)} USDC left`);
    } else {
      ok('No active task (the agent proposes one when it needs to buy)');
    }
  } finally {
    await client.close();
  }
}

/** One line per problem plus how to fix it. Returns the exit code. */
export async function doctorCommand(opts: { gateway?: string }): Promise<number> {
  let failures = 0;
  const bad = (msg: string, fix: string) => {
    failures++;
    fail(msg);
    hint(fix);
  };

  console.log(bold('Environment'));
  const major = Number(process.versions.node.split('.')[0]);
  if (major >= MIN_NODE_MAJOR) ok(`Node.js ${process.versions.node}`);
  else
    bad(
      `Node.js ${process.versions.node} is too old.`,
      `Install Node.js ${MIN_NODE_MAJOR} or newer.`,
    );

  console.log(bold('\nAPI key'));
  const key = loadApiKey();
  const usable = key && isWellFormedApiKey(key.key) ? key.key : undefined;
  if (!key) {
    bad(
      `No API key stored and ${API_KEY_ENV} is not set.`,
      'Run `semanticauth auth` (create the key in the dashboard).',
    );
  } else if (!usable) {
    bad(
      `Key ${maskApiKey(key.key)} (${key.source}) is malformed.`,
      'Copy it from the dashboard again: `semanticauth auth`.',
    );
  } else {
    ok(
      `Key ${maskApiKey(key.key)} (source: ${key.source === 'env' ? API_KEY_ENV : 'stored file'})`,
    );
  }

  console.log(bold('\nGateway'));
  const gatewayUrl = resolveGatewayUrl(opts.gateway);
  if (usable) await checkGateway(gatewayUrl, usable, bad);
  else warn(`Skipped (cannot check ${gatewayUrl} without a valid key).`);

  console.log(bold('\nClaude Code'));
  const claude = await claudePluginStatus();
  if (!claude.claudeFound) warn('Claude Code is not installed (fine if you only use Codex).');
  else if (!claude.installed) warn('Plugin not installed. → `semanticauth install claude-code`');
  else if (claude.enabled === false)
    bad('Plugin is installed but disabled.', 'In Claude Code: /plugin → SemanticAuth → Enable.');
  else {
    ok('Plugin semanticauth installed and enabled');
    hint('Claude Code keeps its own copy of the key; check it in a session with /mcp.');
  }

  console.log(bold('\nCodex'));
  const cx = codexStatus();
  if (!commandExists('codex') && !cx.configured)
    warn('Codex is not installed (fine if you only use Claude Code).');
  else if (!cx.configured) warn('Codex is not configured. → `semanticauth install codex`');
  else {
    const expected = `${gatewayUrl}/mcp`;
    if (cx.url && cx.url !== expected)
      bad(
        `Codex points to ${cx.url}, the CLI to ${expected}.`,
        'Run `semanticauth install codex` again.',
      );
    else ok(`MCP server configured (${cx.url})`);
    if (cx.skillInstalled) ok('SKILL installed');
    else bad('SKILL missing.', 'Run `semanticauth install codex` again.');
  }

  console.log('');
  if (failures) fail(`${failures} problem(s) to fix.`);
  else ok('All good.');
  return failures ? 1 : 0;
}
