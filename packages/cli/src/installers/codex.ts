import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { codex } from '@semanticauth/agent';
import { codexConfigPath, codexSkillTarget, skillSourceDir } from '../paths';
import { CliError, hint, ok, warn } from '../ui';

/** Marker file in the skill folder: uninstall never deletes a folder we didn't create. */
const MANAGED_MARKER = '.semanticauth-managed';

export interface CodexInstallResult {
  configPath: string;
  backupPath?: string;
  skillPath: string;
}

export function installCodex(opts: { gatewayUrl: string }): CodexInstallResult {
  const configPath = codexConfigPath();
  const before = existsSync(configPath) ? readFileSync(configPath, 'utf8') : '';

  let after: string;
  try {
    after = codex.upsertCodexBlock(before, opts.gatewayUrl);
  } catch (err) {
    if (err instanceof codex.CodexConfigConflictError) throw new CliError(err.message);
    throw new CliError(`${configPath} is not valid TOML; nothing was changed.`);
  }

  let backupPath: string | undefined;
  if (before !== after) {
    mkdirSync(dirname(configPath), { recursive: true });
    if (before) {
      backupPath = `${configPath}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
      copyFileSync(configPath, backupPath);
    }
    writeFileSync(configPath, after);
  }
  ok(`MCP server written to ${configPath}`);
  if (backupPath) hint(`Backup of the previous file: ${backupPath}`);

  const skillPath = codexSkillTarget();
  if (existsSync(skillPath) && !existsSync(join(skillPath, MANAGED_MARKER))) {
    warn(`${skillPath} exists and is not managed by semanticauth; SKILL left untouched.`);
  } else {
    rmSync(skillPath, { recursive: true, force: true });
    mkdirSync(dirname(skillPath), { recursive: true });
    cpSync(skillSourceDir(), skillPath, { recursive: true });
    writeFileSync(
      join(skillPath, MANAGED_MARKER),
      'Managed by `semanticauth install codex`. Removed by `semanticauth uninstall codex`.\n',
    );
    ok(`SKILL installed to ${skillPath}`);
  }

  hint(
    `Start Codex with \`semanticauth run codex\` (sets ${codex.CODEX_API_KEY_ENV} from the stored key).`,
  );
  return { configPath, backupPath, skillPath };
}

export function uninstallCodex(): void {
  const configPath = codexConfigPath();
  if (existsSync(configPath)) {
    const before = readFileSync(configPath, 'utf8');
    if (codex.hasManagedBlock(before)) {
      writeFileSync(configPath, codex.removeCodexBlock(before));
      ok(`semanticauth block removed from ${configPath}`);
    } else {
      warn(`${configPath} has no block managed by semanticauth.`);
    }
  }
  const skillPath = codexSkillTarget();
  if (existsSync(join(skillPath, MANAGED_MARKER))) {
    rmSync(skillPath, { recursive: true, force: true });
    ok(`SKILL removed from ${skillPath}`);
  } else if (existsSync(skillPath)) {
    warn(`${skillPath} is not managed by semanticauth; leaving it alone.`);
  }
}

export function codexStatus(): { configured: boolean; url?: string; skillInstalled: boolean } {
  const configPath = codexConfigPath();
  const text = existsSync(configPath) ? readFileSync(configPath, 'utf8') : '';
  return {
    configured: codex.hasManagedBlock(text),
    url: codex.readCodexServerUrl(text),
    skillInstalled: existsSync(join(codexSkillTarget(), 'SKILL.md')),
  };
}
