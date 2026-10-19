/**
 * CLI key and config storage: JSON files with 0600 permissions in ~/.config/semanticauth/.
 * A keychain would be nicer, but a native dependency slows down installation.
 * Claude Code doesn't need the key here: it keeps its own copy (plugin userConfig, sensitive).
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeGatewayUrl } from '@semanticauth/agent';
import { configDir } from '../paths';

export const DEFAULT_GATEWAY_URL = 'http://localhost:8787';
export const API_KEY_ENV = 'SEMANTICAUTH_API_KEY';
export const GATEWAY_URL_ENV = 'SEMANTICAUTH_GATEWAY_URL';

export interface CliConfig {
  gateway_url?: string;
}

const credentialsPath = () => join(configDir(), 'credentials.json');
const configPath = () => join(configDir(), 'config.json');

function ensureDir(): void {
  mkdirSync(configDir(), { recursive: true, mode: 0o700 });
}

function readJsonObject(path: string): Record<string, unknown> | undefined {
  if (!existsSync(path)) return undefined;
  try {
    const data: unknown = JSON.parse(readFileSync(path, 'utf8'));
    return typeof data === 'object' && data !== null
      ? (data as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function writePrivate(path: string, data: unknown): void {
  ensureDir();
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
  // `mode` only applies when the file is created.
  chmodSync(path, 0o600);
}

export type KeySource = 'env' | 'file';

/** Order: SEMANTICAUTH_API_KEY → stored file. */
export function loadApiKey(): { key: string; source: KeySource } | undefined {
  const env = process.env[API_KEY_ENV]?.trim();
  if (env) return { key: env, source: 'env' };
  const stored = readJsonObject(credentialsPath())?.api_key;
  return typeof stored === 'string' && stored ? { key: stored, source: 'file' } : undefined;
}

export function saveApiKey(key: string): string {
  const path = credentialsPath();
  writePrivate(path, { api_key: key });
  return path;
}

export function deleteApiKey(): boolean {
  const path = credentialsPath();
  if (!existsSync(path)) return false;
  rmSync(path);
  return true;
}

export function loadConfig(): CliConfig {
  const url = readJsonObject(configPath())?.gateway_url;
  return typeof url === 'string' ? { gateway_url: url } : {};
}

export function saveConfig(patch: CliConfig): CliConfig {
  const next = { ...loadConfig(), ...patch };
  writePrivate(configPath(), next);
  return next;
}

/** Order: --gateway → SEMANTICAUTH_GATEWAY_URL → config.json → default. */
export function resolveGatewayUrl(flag?: string): string {
  const raw =
    flag || process.env[GATEWAY_URL_ENV]?.trim() || loadConfig().gateway_url || DEFAULT_GATEWAY_URL;
  return normalizeGatewayUrl(raw);
}
