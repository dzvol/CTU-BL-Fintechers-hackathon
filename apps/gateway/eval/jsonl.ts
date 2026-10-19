import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { z } from 'zod';

export function readJsonl<T extends z.ZodType>(file: string, schema: T): z.infer<T>[] {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line, i) => {
      const parsed = schema.safeParse(JSON.parse(line));
      if (!parsed.success) throw new Error(`${file}:${i + 1}: ${parsed.error.message}`);
      return parsed.data;
    });
}

export function writeJsonl(file: string, rows: readonly unknown[]): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(
    file,
    rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : ''),
  );
}

export function readJson<T extends z.ZodType>(file: string, schema: T): z.infer<T> {
  const parsed = schema.safeParse(JSON.parse(readFileSync(file, 'utf8')));
  if (!parsed.success) throw new Error(`${file}: ${parsed.error.message}`);
  return parsed.data;
}

export function writeJson(file: string, value: unknown): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

/** JSON with sorted object keys, so equal values always serialize (and hash) the same. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
