import { NextRequest, NextResponse } from "next/server";
import { getSteamLoginUrl } from "@/lib/auth/steam";
import { redis } from "@/lib/redis/client";
import { getClientIp } from "@/lib/auth/fingerprint";

const RETURN_PATH_COOKIE = "_sbox_login_return";

/**
 * Per-IP rate limit on the Steam login start endpoint. Stops a botnet
 * from using us as an OAuth-flooding amplifier against Steam, and
 * keeps an attacker from spinning up endless callback round-trips
 * trying to brute-force the nonce dedupe.
 *
 * Generous bound — a real user pressing "Sign in with Steam" twelve
 * times in a minute is fine; thirteenth gets a hold-off.
 */
const RATE_LIMIT_MAX = 12;
const RATE_LIMIT_WINDOW_SEC = 60;

async function rateLimit(ip: string): Promise<boolean> {
  if (!redis) return true;
  try {
    const key = `rl:auth-start:${ip}`;
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, RATE_LIMIT_WINDOW_SEC);
    return count <= RATE_LIMIT_MAX;
  } catch {
    return true;
  }
}

/**
 * Sanitize a user-supplied "next" path. We accept only strict local paths
 * — must start with a single `/` (not `//` which the browser would treat
 * as a schemeless URL to another origin), no protocol, no backslash tricks.
 * Anything else falls back to `/` so we can't be used as an open redirect.
 */
function sanitizeReturnPath(raw: string | null): string {
  if (!raw) return "/";
  if (raw.length > 500) return "/"; // paranoia cap
  if (!raw.startsWith("/")) return "/";
  if (raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  // Path-only; decodeURIComponent handled by URLSearchParams already.
  // Reject anything with a scheme or hostname snuck in.
  if (/^\/[a-z]+:/i.test(raw)) return "/";
  // Don't bounce back to auth routes — would defeat the whole flow.
  if (raw.startsWith("/api/auth")) return "/";
  return raw;
}

/**
 * GET /api/auth/steam?next=/path — Redirect to Steam login.
 *
 * Accepts an optional `next` query string that the Steam callback will
 * honor on success. We store it in an HTTP-only cookie (not round-tripped
 * through Steam's OpenID params) so it survives the bounce without being
 * tamperable in transit. Cookie is short-lived — 10 minutes is more than
 * enough for the Steam login round trip.
 */
export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  if (!(await rateLimit(ip))) {
    return NextResponse.json(
      { error: "Too many login attempts. Try again in a minute." },
      { status: 429 },
    );
  }

  const next = sanitizeReturnPath(
    request.nextUrl.searchParams.get("next"),
  );

  const response = NextResponse.redirect(getSteamLoginUrl());
  response.cookies.set(RETURN_PATH_COOKIE, next, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60, // 10 min
  });
  return response;
}
