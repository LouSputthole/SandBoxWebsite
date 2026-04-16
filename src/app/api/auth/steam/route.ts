import { NextRequest, NextResponse } from "next/server";
import { getSteamLoginUrl } from "@/lib/auth/steam";

const RETURN_PATH_COOKIE = "_sbox_login_return";

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
