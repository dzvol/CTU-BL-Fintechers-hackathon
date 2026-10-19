// Records every Jev answer once, so thresholds and ablations can be tuned offline for free.
// It wraps the HTTP layer (createHttpJevClient's fetchFn), so production code stays untouched.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { sha256, stableStringify } from './jsonl';

export interface CacheEntry {
  key: string;
  model: string;
  questionsHash: string;
  /** The raw Jev response body: model, answers with all probabilities, usage. */
  response: unknown;
  latencyMs: number;
  at: string;
}

export interface CacheStats {
  /** Keys this run asked for (hit or miss): exactly the entries a final run must ship. */
  used: Set<string>;
  hits: number;
  misses: number;
  inputTokens: number;
  latenciesMs: number[];
}

interface RequestBody {
  model: string;
  state: unknown;
  questions: unknown;
}

export const questionsHash = (questions: unknown) =>
  sha256(stableStringify(questions)).slice(0, 12);

/** Cache key: the same model, questions and state always give the same key. */
export const cacheKey = (body: RequestBody) =>
  sha256(stableStringify({ model: body.model, questions: body.questions, state: body.state }));

/**
 * A fetch for createHttpJevClient that answers from `file` when it can and records new answers.
 * `offline` refuses to call Jev at all (tuning and reports must not spend anything).
 */
export function createCachedFetch(options: {
  file: string;
  offline?: boolean;
  fetch?: typeof fetch;
}): { fetch: typeof fetch; stats: CacheStats; entries: Map<string, CacheEntry> } {
  const entries = new Map<string, CacheEntry>();
  if (existsSync(options.file)) {
    for (const line of readFileSync(options.file, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      const entry = JSON.parse(line) as CacheEntry;
      entries.set(entry.key, entry);
    }
  }
  const stats: CacheStats = {
    used: new Set(),
    hits: 0,
    misses: 0,
    inputTokens: 0,
    latenciesMs: [],
  };
  const upstream = options.fetch ?? fetch;

  const cachedFetch = async (url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as RequestBody;
    const key = cacheKey(body);
    stats.used.add(key);
    const hit = entries.get(key);
    if (hit) {
      stats.hits++;
      stats.latenciesMs.push(hit.latencyMs);
      return Response.json(hit.response);
    }
    if (options.offline) throw new Error(`Jev answer not cached (offline run): ${key}`);

    const started = performance.now();
    const res = await upstream(url, init);
    const latencyMs = Math.round(performance.now() - started);
    // Errors aren't cached: the next run tries again (and the case fails closed meanwhile).
    if (!res.ok) return res;
    const response = (await res.json()) as { usage?: { input_tokens?: number } };
    const entry: CacheEntry = {
      key,
      model: body.model,
      questionsHash: questionsHash(body.questions),
      response,
      latencyMs,
      at: new Date().toISOString(),
    };
    entries.set(key, entry);
    mkdirSync(dirname(options.file), { recursive: true });
    appendFileSync(options.file, JSON.stringify(entry) + '\n');
    stats.misses++;
    stats.inputTokens += response.usage?.input_tokens ?? 0;
    stats.latenciesMs.push(latencyMs);
    return Response.json(response);
  };
  return { fetch: cachedFetch as typeof fetch, stats, entries };
}
