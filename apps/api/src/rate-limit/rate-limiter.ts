/**
 * Fixed-window request counter per key (e.g. "user:paid"). In memory: right for
 * the single Render instance this API runs on. With several instances, move
 * the counters to Postgres or Redis (the guard wouldn't change).
 */
export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the window resets (0 when allowed). */
  retryAfterSeconds: number;
}

/** Above this many tracked keys, expired windows are swept. */
const SWEEP_ABOVE = 5_000;

export class RateLimiter {
  private readonly windows = new Map<string, { start: number; count: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  /** Counts one request for `key`; refuses it when `limit` was already reached in this window. */
  take(key: string, limit: number, windowMs: number): RateLimitResult {
    const now = this.now();
    if (this.windows.size > SWEEP_ABOVE) this.sweep(now, windowMs);
    const current = this.windows.get(key);
    if (!current || now - current.start >= windowMs) {
      this.windows.set(key, { start: now, count: 1 });
      return { allowed: limit > 0, retryAfterSeconds: limit > 0 ? 0 : Math.ceil(windowMs / 1000) };
    }
    if (current.count >= limit) {
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((current.start + windowMs - now) / 1000)) };
    }
    current.count += 1;
    return { allowed: true, retryAfterSeconds: 0 };
  }

  get size(): number {
    return this.windows.size;
  }

  private sweep(now: number, windowMs: number): void {
    for (const [key, window] of this.windows) {
      if (now - window.start >= windowMs) this.windows.delete(key);
    }
  }
}

/** Routes that cost money per call (Google, Claude) get a tighter limit. */
export function rateLimitClass(path: string): 'paid' | 'default' {
  return /^\/v1\/(discover|google)(\/|$|\?)/.test(path) ? 'paid' : 'default';
}
