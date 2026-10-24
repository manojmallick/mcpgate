/**
 * Simple sliding-window rate limiter (in-memory).
 * Fine for single-instance Lambda/Worker/Cloud Run; swap for Redis in multi-instance.
 */

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetMs: number;
}

export class RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(private windowMs: number) {}

  check(key: string, limit: number, now = Date.now()): RateLimitResult {
    const cutoff = now - this.windowMs;
    const prev = this.hits.get(key) ?? [];
    const recent = prev.filter((t) => t > cutoff);
    if (recent.length >= limit) {
      this.hits.set(key, recent);
      const oldest = recent[0] ?? now;
      return {
        allowed: false,
        remaining: 0,
        limit,
        resetMs: Math.max(0, oldest + this.windowMs - now),
      };
    }
    recent.push(now);
    this.hits.set(key, recent);
    // prune map if huge
    if (this.hits.size > 10_000) {
      for (const [k, times] of this.hits) {
        const kept = times.filter((t) => t > cutoff);
        if (kept.length === 0) this.hits.delete(k);
        else this.hits.set(k, kept);
      }
    }
    return {
      allowed: true,
      remaining: Math.max(0, limit - recent.length),
      limit,
      resetMs: this.windowMs,
    };
  }

  /** test helper */
  reset() {
    this.hits.clear();
  }
}
