type Preset = 'general' | 'ratings' | 'generate';

const LIMITS: Record<Preset, { max: number; windowMs: number }> = {
  general:  { max: 60, windowMs: 60_000 },
  ratings:  { max: 10, windowMs: 60_000 },
  generate: { max: 5,  windowMs: 60_000 },
};

const buckets = new Map<string, number[]>();

let pruneTimer: NodeJS.Timeout | null = null;
function schedulePrune() {
  if (pruneTimer) return;
  pruneTimer = setInterval(() => {
    const cutoff = Date.now() - 60_000;
    for (const [k, arr] of buckets) {
      const kept = arr.filter((t) => t > cutoff);
      if (kept.length === 0) buckets.delete(k);
      else buckets.set(k, kept);
    }
  }, 5 * 60_000);
  // Don't keep the event loop alive for this.
  pruneTimer.unref?.();
}

export function ipFrom(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return '127.0.0.1';
}

/**
 * Sliding-window rate limit. Returns `true` when the request is allowed.
 */
export function rateLimit(req: Request, preset: Preset): boolean {
  schedulePrune();
  const { max, windowMs } = LIMITS[preset];
  const key = `${preset}:${ipFrom(req)}`;
  const now = Date.now();
  const cutoff = now - windowMs;
  const hits = (buckets.get(key) ?? []).filter((t) => t > cutoff);
  if (hits.length >= max) {
    buckets.set(key, hits);
    return false;
  }
  hits.push(now);
  buckets.set(key, hits);
  return true;
}
