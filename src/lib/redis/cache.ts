import { redis } from "./client";

// TTL values in seconds
export const CACHE_TTL = {
  ITEMS_LIST: 60 * 2,      // 2 minutes — browse page results
  ITEM_DETAIL: 60 * 2,     // 2 minutes — single item with price history
  PRICE_HISTORY: 60 * 10,  // 10 minutes — price chart data
  HOMEPAGE: 60 * 1,        // 1 minute — trending/featured sections
} as const;

/**
 * Get a cached value, or compute and cache it.
 * Falls back to computing without cache if Redis is unavailable.
 */
export async function cached<T>(
  key: string,
  ttlSeconds: number,
  compute: () => Promise<T>
): Promise<T> {
  try {
    const hit = await redis.get(key);
    if (hit) {
      return JSON.parse(hit) as T;
    }
  } catch {
    // Redis unavailable — fall through to compute
  }

  const value = await compute();

  try {
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch {
    // Redis unavailable — value still returned uncached
  }

  return value;
}

/**
 * Invalidate a specific cache key.
 */
export async function invalidate(key: string): Promise<void> {
  try {
    await redis.del(key);
  } catch {
    // Ignore Redis errors on invalidation
  }
}

/**
 * Invalidate all keys matching a pattern (e.g. "items:*").
 */
export async function invalidatePattern(pattern: string): Promise<number> {
  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    return keys.length;
  } catch {
    return 0;
  }
}

/**
 * Build a deterministic cache key from a base name and params.
 */
export function cacheKey(base: string, params?: Record<string, string | undefined>): string {
  if (!params) return base;
  const sorted = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  return sorted ? `${base}:${sorted}` : base;
}
