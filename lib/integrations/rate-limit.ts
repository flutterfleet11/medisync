// Tiny in-memory fixed-window limiter (per server instance). Protects the
// sponsor API quotas from a single user hammering a button during the demo.
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryInSec: number } {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryInSec: 0 };
  }
  if (bucket.count >= limit) return { ok: false, retryInSec: Math.ceil((bucket.resetAt - now) / 1000) };
  bucket.count += 1;
  return { ok: true, retryInSec: 0 };
}

/** Small TTL cache to avoid paying for identical sponsor API calls. */
export class TtlCache<T> {
  private store = new Map<string, { value: T; expires: number }>();
  constructor(private ttlMs: number, private max = 200) {}
  get(key: string): T | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (hit.expires < Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return hit.value;
  }
  set(key: string, value: T) {
    if (this.store.size >= this.max) {
      const first = this.store.keys().next().value;
      if (first !== undefined) this.store.delete(first);
    }
    this.store.set(key, { value, expires: Date.now() + this.ttlMs });
  }
}
