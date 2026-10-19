import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sha256 } from '../jsonl';
import { PATHS } from '../paths';

/** Every external source, with its licence, so the report can cite exact versions. */
export const SOURCES = {
  bazaar: {
    name: 'x402 Bazaar (CDP discovery API)',
    url: 'https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources',
    license: 'public listing; texts belong to their merchants (used for evaluation only)',
  },
  injecagent: {
    name: 'InjecAgent (Zhan et al., ACL Findings 2024)',
    url: 'https://raw.githubusercontent.com/uiuc-kang-lab/InjecAgent/main/data/',
    license: 'MIT',
  },
  notinject: {
    name: 'NotInject (InjecGuard/PIGuard, Li & Liu 2024)',
    url: 'https://datasets-server.huggingface.co/rows?dataset=leolee99/NotInject',
    license: 'MIT',
  },
  llmail: {
    name: 'LLMail-Inject (Abdelnabi et al. 2025)',
    url: 'https://huggingface.co/datasets/microsoft/llmail-inject-challenge/resolve/main/data/',
    license: 'MIT',
  },
} as const;
export type SourceId = keyof typeof SOURCES;

export interface RawFile {
  source: SourceId;
  file: string;
  url: string;
  sha256: string;
  fetchedAt: string;
}

const MANIFEST = join(PATHS.raw, 'manifest.json');

export function readManifest(): RawFile[] {
  return existsSync(MANIFEST) ? (JSON.parse(readFileSync(MANIFEST, 'utf8')) as RawFile[]) : [];
}

/** Saves a downloaded file under data/raw and records its hash in the manifest. */
export function saveRaw(source: SourceId, file: string, url: string, content: string): void {
  mkdirSync(PATHS.raw, { recursive: true });
  writeFileSync(join(PATHS.raw, file), content);
  const entry: RawFile = {
    source,
    file,
    url,
    sha256: sha256(content),
    fetchedAt: new Date().toISOString(),
  };
  const others = readManifest().filter((f) => f.file !== file);
  writeFileSync(MANIFEST, JSON.stringify([...others, entry], null, 2) + '\n');
}

export const rawPath = (file: string) => join(PATHS.raw, file);
export const hasRaw = (file: string) => existsSync(rawPath(file));
export const readRaw = (file: string) => readFileSync(rawPath(file), 'utf8');

/** Version tag for a case's `source`: the source name plus the hash prefix of the raw file. */
export function versionOf(file: string): string {
  const entry = readManifest().find((f) => f.file === file);
  return entry ? `${entry.source}@${entry.sha256.slice(0, 10)}` : file;
}

export async function download(url: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`GET ${url} → HTTP ${res.status}`);
  return res.text();
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
