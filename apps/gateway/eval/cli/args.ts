import { execSync } from 'node:child_process';

/** `--name value`, `--flag` and positional arguments. */
export function parseArgs(argv = process.argv.slice(2)) {
  const flags = new Map<string, string | true>();
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flags.set(arg.slice(2), next);
      i++;
    } else flags.set(arg.slice(2), true);
  }
  return {
    positional,
    has: (name: string) => flags.has(name),
    get: (name: string) => {
      const value = flags.get(name);
      return typeof value === 'string' ? value : undefined;
    },
  };
}

export function gitState() {
  const run = (cmd: string) => {
    try {
      return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
      return 'unknown';
    }
  };
  return { commit: run('git rev-parse HEAD'), dirty: run('git status --porcelain') !== '' };
}

export const runId = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

export function fail(message: string): never {
  console.error(message);
  process.exit(1);
}
