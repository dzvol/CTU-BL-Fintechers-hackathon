import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Where the CLI keeps its config and key. SEMANTICAUTH_CONFIG_DIR overrides it (tests). */
export function configDir(): string {
  if (process.env.SEMANTICAUTH_CONFIG_DIR) return process.env.SEMANTICAUTH_CONFIG_DIR;
  const xdg = process.env.XDG_CONFIG_HOME?.trim();
  return join(xdg || join(homedir(), '.config'), 'semanticauth');
}

export const codexHome = (): string => process.env.CODEX_HOME ?? join(homedir(), '.codex');
export const codexConfigPath = (): string => join(codexHome(), 'config.toml');

/** Codex loads Agent Skills from ~/.agents/skills/<name>/SKILL.md. */
export const agentsSkillsDir = (): string =>
  process.env.SEMANTICAUTH_AGENTS_SKILLS_DIR ?? join(homedir(), '.agents', 'skills');
export const codexSkillTarget = (): string => join(agentsSkillsDir(), 'semanticauth');

/** `harness-plugin/` of this checkout. The CLI has no build step, so it always runs from one. */
export function harnessPluginDir(): string {
  const dir = resolve(dirname(fileURLToPath(import.meta.url)), '../../../harness-plugin');
  if (!existsSync(join(dir, '.claude-plugin', 'marketplace.json'))) {
    throw new Error(`harness-plugin not found at ${dir}; run the CLI from a repo checkout.`);
  }
  return dir;
}

/** One SKILL serves both harnesses; the Claude Code plugin copy is the source of truth. */
export function skillSourceDir(): string {
  const dir = join(harnessPluginDir(), 'integrations', 'claude-code', 'skills', 'semanticauth');
  if (!existsSync(join(dir, 'SKILL.md'))) throw new Error(`SKILL.md missing in ${dir}`);
  return dir;
}
