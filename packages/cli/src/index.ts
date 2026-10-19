#!/usr/bin/env -S npx tsx
/**
 * semanticauth: connects Claude Code and Codex to the SemanticAuth gateway.
 *
 *   semanticauth auth                       store and verify the API key
 *   semanticauth config get|set …           gateway_url
 *   semanticauth install <claude-code|codex>
 *   semanticauth uninstall <claude-code|codex>
 *   semanticauth doctor                     what is wrong and how to fix it
 *   semanticauth run codex [args…]          start Codex with the key in its environment
 */
import { Command, Option } from 'commander';
import { authCommand } from './commands/auth';
import { configGet, configSet } from './commands/config';
import { doctorCommand } from './commands/doctor';
import { installCommand, runCommand, uninstallCommand } from './commands/install';
import { CliError, fail, hint } from './ui';

const program = new Command()
  .name('semanticauth')
  .description('Set up SemanticAuth for Claude Code and Codex')
  .version('0.0.0')
  .enablePositionalOptions();

const gatewayOpt = () => new Option('-g, --gateway <url>', 'gateway URL (without /mcp)');
const scopeOpt = () =>
  new Option('-s, --scope <scope>', 'Claude Code install scope')
    .choices(['user', 'project', 'local'])
    .default('user');

program
  .command('auth')
  .description('Store the API key (masked prompt or stdin) and verify it against the gateway')
  .addOption(gatewayOpt())
  .option('--no-verify', 'do not verify the key against the gateway')
  .option('--logout', 'delete the stored key')
  .action((opts) => authCommand(opts));

const config = program.command('config').description('CLI configuration');
config
  .command('get [key]')
  .description('Print the configuration')
  .action((key?: string) => configGet(key));
config
  .command('set <key> <value>')
  .description('Set a value (gateway_url)')
  .action((key: string, value: string) => configSet(key, value));

program
  .command('install <harness>')
  .description('Install SemanticAuth into a harness: claude-code | codex')
  .addOption(gatewayOpt())
  .option('--source <source>', 'Claude Code marketplace: path, owner/repo or git URL')
  .addOption(scopeOpt())
  .action((harness: string, opts) => installCommand(harness, opts));

program
  .command('uninstall <harness>')
  .description('Remove exactly what install added')
  .addOption(scopeOpt())
  .action((harness: string, opts) => uninstallCommand(harness, opts));

program
  .command('doctor')
  .description('Check the key, the gateway, its tools and the harness installs')
  .addOption(gatewayOpt())
  .action(async (opts) => {
    process.exitCode = await doctorCommand(opts);
  });

program
  .command('run <harness> [args...]')
  .description('Start a harness with the API key in its environment (codex)')
  .allowUnknownOption()
  .passThroughOptions()
  .action(async (harness: string, args: string[] | undefined) => {
    process.exitCode = await runCommand(harness, args ?? []);
  });

program.parseAsync().catch((err: unknown) => {
  if (err instanceof CliError) {
    fail(err.message);
    if (err.hintText) hint(err.hintText);
  } else {
    fail(err instanceof Error ? err.message : String(err));
  }
  process.exitCode = 1;
});
