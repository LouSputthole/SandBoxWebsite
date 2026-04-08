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
  if (redis) {
    try {
      // @upstash/redis auto-deserializes JSON
      const hit = await redis.get<T>(key);
      if (hit !== null && hit !== undefined) {
        return hit;
      }
    } catch {
      // Redis unavailable — fall through to compute
    }
  }

  const value = await compute();

  if (redis) {
    try {
      // @upstash/redis auto-serializes JSON, uses { ex } option for TTL
      await redis.set(key, value, { ex: ttlSeconds });
    } catch {
      // Redis unavailable — value still returned uncached
    }
  }

  return value;
}

/**
 * Invalidate a specific cache key.
 */
export async function invalidate(key: string): Promise<void> {
  if (!redis) return;
  try {
    await redis.del(key);
  } catch {
    // Ignore Redis errors on invalidation
  }
}

/**
 * Invalidate all keys matching a pattern (e.g. "items:*").
 * Uses SCAN to avoid blocking on large keyspaces.
 */
export async function invalidatePattern(pattern: string): Promise<number> {
  if (!redis) return 0;
  try {
    let cursor = 0;
    let totalDeleted = 0;

    do {
      const [nextCursor, keys] = await redis.scan(cursor, { match: pattern, count: 100 });
      cursor = Number(nextCursor);
      if (keys.length > 0) {
        await redis.del(...keys);
        totalDeleted += keys.length;
      }
    } while (cursor !== 0);

    return totalDeleted;
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
