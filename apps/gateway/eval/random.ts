import { createHash } from 'node:crypto';
import type { Split } from './cases';

/** Bump only together with a note in README.md: it reshuffles dev/test. */
export const SPLIT_SEED = 'semanticauth-eval-v1';
export const DEV_SHARE = 0.6;

const unit = (text: string) => createHash('sha256').update(text).digest().readUInt32BE(0) / 2 ** 32;

/** Deterministic dev/test assignment of a group; the same group always lands in the same split. */
export function splitOf(group: string): Split {
  return unit(`${SPLIT_SEED}:${group}`) < DEV_SHARE ? 'dev' : 'test';
}

/** Small seeded PRNG (mulberry32) so builds are reproducible. */
export function seededRandom(seed: string) {
  let state = Math.floor(unit(seed) * 2 ** 32);
  const next = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
  return {
    next,
    pick: <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)]!,
    /** `count` distinct items in a seeded order. */
    sample: <T>(items: readonly T[], count: number): T[] => {
      const copy = [...items];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [copy[i], copy[j]] = [copy[j]!, copy[i]!];
      }
      return copy.slice(0, count);
    },
  };
}
