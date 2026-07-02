import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import {
  marketAccess,
  parseMarketOpen,
  parsePreviewSteamIds,
  verifyPreviewToken,
  MarketGatedError,
  MARKET_PREVIEW_COOKIE,
  type MarketAccessDecision,
} from "./access";

/**
 * Request-bound marketplace gate. Reads env + the session user + the preview
 * cookie and returns the pure {@link marketAccess} decision. Kept out of
 * ./access.ts so that module stays dependency-free and unit-testable.
 */
export async function getMarketAccess(): Promise<MarketAccessDecision> {
  const marketOpen = parseMarketOpen(process.env.MARKET_OPEN);
  // Fully open — no need to touch cookies or the DB.
  if (marketOpen) return { open: true, reason: "public_open" };

  const previewSteamIds = parsePreviewSteamIds(process.env.MARKET_PREVIEW_STEAMIDS);

  // Cheapest preview path first: a valid signed cookie unlocks any browser
  // without a DB round-trip (the "unlock on a device that isn't logged in" case).
  const cookieStore = await cookies();
  const previewCookieValid = verifyPreviewToken(
    cookieStore.get(MARKET_PREVIEW_COOKIE)?.value,
    process.env.ANALYTICS_KEY,
  );
  if (previewCookieValid) {
    return marketAccess({ marketOpen, previewSteamIds, userSteamId: null, previewCookieValid: true });
  }

  // Only resolve the user when there's an allowlist to check against — avoids
  // a session/DB read when the SteamID path can't possibly grant access.
  let userSteamId: string | null = null;
  if (previewSteamIds.size > 0) {
    const user = await getCurrentUser();
    userSteamId = user?.steamId ?? null;
  }

  return marketAccess({ marketOpen, previewSteamIds, userSteamId, previewCookieValid: false });
}

/**
 * Throw {@link MarketGatedError} when the caller isn't allowed into the
 * marketplace yet. Used by API routes (see {@link marketGate}).
 */
export async function assertMarketApiAccess(): Promise<void> {
  const decision = await getMarketAccess();
  if (!decision.open) throw new MarketGatedError();
}

/**
 * Route-handler helper: run the gate as the FIRST thing in an /api/market/**
 * handler. Returns a ready-to-return 403 response when gated, or null when the
 * caller may proceed — so the route's own auth/DB work never runs for a
 * locked-out visitor:
 *
 *   const gate = await marketGate();
 *   if (gate) return gate;
 */
export async function marketGate(): Promise<NextResponse | null> {
  try {
    await assertMarketApiAccess();
    return null;
  } catch (err) {
    if (err instanceof MarketGatedError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }
}
