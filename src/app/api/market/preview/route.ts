import { NextRequest, NextResponse } from "next/server";
import { guardAdminRoute } from "@/lib/auth/admin-guard";
import { makePreviewToken, MARKET_PREVIEW_COOKIE } from "@/lib/market/access";

export const dynamic = "force-dynamic";

// ~30 days, matching the session cookie lifetime.
const PREVIEW_MAX_AGE_SEC = 30 * 24 * 60 * 60;

/**
 * Only allow redirects back into the marketplace section — never an absolute or
 * protocol-relative URL (open-redirect guard). Anything else falls back to /market.
 */
function safeNext(raw: string | null): string {
  if (raw && raw.startsWith("/market") && !raw.startsWith("//")) return raw;
  return "/market";
}

/**
 * GET /api/market/preview — issue or clear the marketplace preview cookie.
 *
 *   ?key=<ANALYTICS_KEY>[&next=/market...]  → set a signed HttpOnly cookie, then
 *                                             redirect to `next` (relative /market only).
 *   ?clear=1                                → delete the cookie, then redirect to /market.
 *
 * The cookie is an HMAC-SHA256 of a fixed message keyed by ANALYTICS_KEY, so it
 * can't be forged without the key and rotating the key invalidates old previews.
 * This route is intentionally EXEMPT from the marketplace gate (it's how you get
 * past it). A wrong/missing key → 401 (with the house brute-force protection).
 */
export async function GET(request: NextRequest) {
  const secure = process.env.NODE_ENV === "production";

  // Clearing your own preview needs no key.
  if (request.nextUrl.searchParams.get("clear") === "1") {
    const res = NextResponse.redirect(new URL("/market", request.url));
    res.cookies.delete(MARKET_PREVIEW_COOKIE);
    return res;
  }

  // Setting a preview requires the analytics key (reuse the house admin guard,
  // analytics-only — it accepts ?key= and rate-limits brute-force guesses).
  const guard = await guardAdminRoute(request, { allowedKeys: ["analytics"] });
  if (!guard.ok) return guard.response;

  const analyticsKey = process.env.ANALYTICS_KEY;
  if (!analyticsKey) {
    return NextResponse.json({ error: "Preview not configured" }, { status: 500 });
  }

  const next = safeNext(request.nextUrl.searchParams.get("next"));
  const res = NextResponse.redirect(new URL(next, request.url));
  res.cookies.set(MARKET_PREVIEW_COOKIE, makePreviewToken(analyticsKey), {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: PREVIEW_MAX_AGE_SEC,
  });
  return res;
}
