/** Fixed-window, in-memory rate limit. Good enough for one gateway process. */
export interface RateLimiter {
  /** Counts a hit for `key`; false when the key is over its limit in the current window. */
  hit(key: string): boolean;
}

export function createRateLimiter(opts: {
  limit: number;
  windowMs: number;
  now?: () => number;
}): RateLimiter {
  const now = opts.now ?? Date.now;
  const windows = new Map<string, { start: number; count: number }>();

  return {
    hit(key) {
      const t = now();
      const window = windows.get(key);
      if (!window || t - window.start >= opts.windowMs) {
        windows.set(key, { start: t, count: 1 });
        return true;
      }
      window.count += 1;
      return window.count <= opts.limit;
    },
  };
}
