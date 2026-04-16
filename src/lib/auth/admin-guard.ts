import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis/client";

/**
 * Admin-route auth + brute-force protection.
 *
 * Admin endpoints are gated by bearer tokens that real users type into UIs
 * (like /admin/tweet's password form). Without rate limiting, an attacker
 * can script guesses at the `ANALYTICS_KEY` / `CRON_SECRET` until they
 * land on the right one. This helper wraps the bearer check with a
 * per-IP failed-attempt counter in Redis and trips a cooldown after too
 * many misses in a short window.
 *
 * Failure policy:
 *   - Each bad bearer (wrong token, or no token) bumps a counter keyed
 *     by client IP with a sliding window.
 *   - Past MAX_FAILURES within WINDOW_SEC, the IP gets 429 responses
 *     until the counter expires. The response includes a Retry-After
 *     header based on remaining TTL.
 *   - A correct bearer clears the IP's counter immediately — a real
 *     user's single typo won't haunt them for 15 minutes.
 *
 * If Redis is unavailable we fail OPEN on rate-limit but still enforce
 * auth. Losing auth entirely (fail-closed on Redis outage) is worse
 * than temporarily losing lockout protection.
 */

const WINDOW_SEC = 15 * 60; // 15 minutes
const MAX_FAILURES = 6;

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

/**
 * Pull the bearer token from either the Authorization header (preferred —
 * doesn't leak into access logs / browser history) or ?key= query param
 * as a transitional fallback while older UIs migrate.
 */
function extractToken(request: NextRequest): string | null {
  const header = request.headers.get("authorization");
  if (header?.startsWith("Bearer ")) return header.slice(7);
  return request.nextUrl.searchParams.get("key");
}

async function bumpFail(key: string): Promise<void> {
  if (!redis) return;
  try {
    const count = await redis.incr(key);
    // Only set expire on the first increment — subsequent increments
    // within the window keep the original TTL (sliding window not desired:
    // we don't want an attacker to "reset" the window by spacing out
    // attempts just past TTL).
    if (count === 1) await redis.expire(key, WINDOW_SEC);
  } catch {
    // Redis error — swallowed; caller still rejects the request on auth.
  }
}

type Guarded =
  | { ok: true; keyType: "cron" | "analytics" }
  | { ok: false; response: NextResponse };

/**
 * @param opts.allowedKeys  Which server secrets to accept. Default both.
 *                          Pass ["cron"] to restrict an endpoint to cron
 *                          callers (no human UI should hit it).
 */
export async function guardAdminRoute(
  request: NextRequest,
  opts: { allowedKeys?: Array<"cron" | "analytics"> } = {},
): Promise<Guarded> {
  const allowed = opts.allowedKeys ?? ["cron", "analytics"];
  const cronSecret = allowed.includes("cron") ? process.env.CRON_SECRET : undefined;
  const analyticsKey = allowed.includes("analytics") ? process.env.ANALYTICS_KEY : undefined;

  // Misconfiguration: no secrets available to check against. Fail closed
  // with 500 rather than silently accept any request.
  if (!cronSecret && !analyticsKey) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Admin auth not configured" },
        { status: 500 },
      ),
    };
  }

  const ip = getClientIp(request);
  const rlKey = `bf:admin:${ip}`;

  // Lockout check. Happens BEFORE we look at the token so a locked-out
  // attacker gets 429 whether or not they're still sending guesses.
  if (redis) {
    try {
      const count = (await redis.get<number>(rlKey)) ?? 0;
      if (count >= MAX_FAILURES) {
        const ttl = (await redis.ttl(rlKey)) ?? WINDOW_SEC;
        const retryAfter = Math.max(60, ttl);
        return {
          ok: false,
          response: NextResponse.json(
            {
              error: `Too many failed attempts. Try again in ${Math.ceil(retryAfter / 60)} minute${retryAfter >= 120 ? "s" : ""}.`,
            },
            {
              status: 429,
              headers: { "Retry-After": String(retryAfter) },
            },
          ),
        };
      }
    } catch {
      // Redis read failed — fail open on rate limit (still enforce auth).
    }
  }

  const token = extractToken(request);
  if (!token) {
    await bumpFail(rlKey);
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  let matchedType: "cron" | "analytics" | null = null;
  if (cronSecret && token === cronSecret) matchedType = "cron";
  else if (analyticsKey && token === analyticsKey) matchedType = "analytics";

  if (!matchedType) {
    await bumpFail(rlKey);
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  // Correct token — reset the failure counter for this IP so one earlier
  // typo doesn't count against future attempts.
  if (redis) {
    redis.del(rlKey).catch(() => {});
  }

  return { ok: true, keyType: matchedType };
}
