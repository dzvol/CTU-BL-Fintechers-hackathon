import {
  GatewayAuthError,
  GatewayUnreachableError,
  isWellFormedApiKey,
  maskApiKey,
  whoami,
} from '@semanticauth/agent';
import { deleteApiKey, resolveGatewayUrl, saveApiKey } from '../credentials/credential-store';
import { CliError, hint, ok, warn } from '../ui';

async function readKey(): Promise<string> {
  if (!process.stdin.isTTY) {
    // Non-interactive: `echo "$KEY" | semanticauth auth`
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks).toString('utf8').trim();
  }
  const { default: password } = await import('@inquirer/password');
  return (
    await password({ message: 'SemanticAuth API key (from the dashboard):', mask: '•' })
  ).trim();
}

export async function authCommand(opts: {
  gateway?: string;
  verify: boolean;
  logout?: boolean;
}): Promise<void> {
  if (opts.logout) {
    if (deleteApiKey()) ok('Stored API key deleted.');
    else warn('No stored key.');
    hint('The key kept by Claude Code is removed with `semanticauth uninstall claude-code`.');
    return;
  }

  const key = await readKey();
  if (!isWellFormedApiKey(key)) {
    throw new CliError(
      "That doesn't look like a SemanticAuth API key.",
      'Copy it again from the dashboard; it starts with sa_.',
    );
  }

  if (opts.verify) {
    const gatewayUrl = resolveGatewayUrl(opts.gateway);
    try {
      const me = await whoami({ gatewayUrl, apiKey: key });
      ok(`Key ${maskApiKey(key)} verified against ${gatewayUrl} (${me.email}).`);
    } catch (err) {
      if (err instanceof GatewayAuthError) {
        throw new CliError(
          'The gateway rejected the key (invalid or revoked).',
          'Create a new key in the dashboard.',
        );
      }
      if (err instanceof GatewayUnreachableError) {
        throw new CliError(
          err.message,
          'Check the URL (`semanticauth config set gateway_url …`) or use --no-verify.',
        );
      }
      throw err;
    }
  }

  const path = saveApiKey(key);
  ok(`Key saved to ${path} (mode 600).`);
  hint('Hand it to Claude Code with `semanticauth install claude-code`.');
}
