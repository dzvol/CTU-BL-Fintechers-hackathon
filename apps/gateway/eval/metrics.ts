// Small, dependency-free statistics. Every rate is reported with a 95 % interval: with tens or
// hundreds of cases a few points of difference are noise.

export interface Rate {
  k: number;
  n: number;
  rate: number;
  low: number;
  high: number;
}

/** Wilson score interval; behaves at 0/n and n/n, unlike the normal approximation. */
export function wilson(k: number, n: number, z = 1.96): Rate {
  if (n === 0) return { k, n, rate: NaN, low: NaN, high: NaN };
  const p = k / n;
  const denom = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return { k, n, rate: p, low: Math.max(0, centre - half), high: Math.min(1, centre + half) };
}

/** Area under the ROC curve (probability a random positive scores above a random negative). */
export function auroc(scores: readonly number[], positive: readonly boolean[]): number {
  const pos = scores.filter((_, i) => positive[i]);
  const neg = scores.filter((_, i) => !positive[i]);
  if (pos.length === 0 || neg.length === 0) return NaN;
  let wins = 0;
  for (const p of pos) for (const n of neg) wins += p > n ? 1 : p === n ? 0.5 : 0;
  return wins / (pos.length * neg.length);
}

/** Smallest threshold whose false-positive rate stays within `maxFpr`, and its true-positive rate. */
export function tprAtFpr(
  scores: readonly number[],
  positive: readonly boolean[],
  maxFpr: number,
): { threshold: number; tpr: number; fpr: number } {
  const candidates = [...new Set(scores)].sort((a, b) => a - b);
  const neg = positive.filter((p) => !p).length;
  const pos = positive.length - neg;
  for (const threshold of candidates) {
    const fp = scores.filter((s, i) => !positive[i] && s >= threshold).length;
    if (neg > 0 && fp / neg > maxFpr) continue;
    const tp = scores.filter((s, i) => positive[i] && s >= threshold).length;
    return { threshold, tpr: pos ? tp / pos : NaN, fpr: neg ? fp / neg : NaN };
  }
  return { threshold: Infinity, tpr: 0, fpr: 0 };
}

/**
 * Exact McNemar test for two configurations on the same cases: only cases where they disagree
 * count. `b` = A right/B wrong, `c` = A wrong/B right. Two-sided p-value.
 */
export function mcnemar(aCorrect: readonly boolean[], bCorrect: readonly boolean[]) {
  let b = 0;
  let c = 0;
  aCorrect.forEach((a, i) => {
    if (a && !bCorrect[i]) b++;
    if (!a && bCorrect[i]) c++;
  });
  const n = b + c;
  if (n === 0) return { b, c, p: 1 };
  let tail = 0;
  const k = Math.min(b, c);
  let coeff = 1;
  for (let i = 0; i <= k; i++) {
    if (i > 0) coeff = (coeff * (n - i + 1)) / i;
    tail += coeff / 2 ** n;
  }
  return { b, c, p: Math.min(1, 2 * tail) };
}

/** Counts of expected × actual. */
export function confusion<E extends string, A extends string>(
  pairs: readonly { expected: E; actual: A }[],
): Record<E, Partial<Record<A, number>>> {
  const table = {} as Record<E, Partial<Record<A, number>>>;
  for (const { expected, actual } of pairs) {
    table[expected] ??= {};
    table[expected][actual] = (table[expected][actual] ?? 0) + 1;
  }
  return table;
}

export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!;
}

export const pct = (r: Rate) =>
  Number.isNaN(r.rate)
    ? 'n/a'
    : `${(r.rate * 100).toFixed(1)} % (${r.k}/${r.n}, CI ${(r.low * 100).toFixed(1)}–${(r.high * 100).toFixed(1)})`;

/** Cohen's kappa: agreement of two annotators beyond chance (1 = perfect, 0 = chance level). */
export function cohensKappa(a: readonly string[], b: readonly string[]): number {
  const n = a.length;
  if (n === 0) return NaN;
  const observed = a.filter((x, i) => x === b[i]).length / n;
  const labels = new Set([...a, ...b]);
  let expected = 0;
  for (const l of labels) {
    expected += (a.filter((x) => x === l).length / n) * (b.filter((x) => x === l).length / n);
  }
  return expected === 1 ? 1 : (observed - expected) / (1 - expected);
}
