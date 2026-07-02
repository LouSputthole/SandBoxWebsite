import { createHmac, timingSafeEqual } from "crypto";

/**
 * Coming-soon gate for the marketplace — the pure, dependency-free core.
 *
 * The whole /market section (pages + /api/market/** routes) ships to prod but
 * stays locked to the public until launch. The owner (and named testers) can
 * see and use the real thing via an allowlisted SteamID or a signed preview
 * cookie. One env flip (MARKET_OPEN=true) opens it to everyone.
 *
 * This module holds only pure logic (no next/headers, no DB) so it is trivially
 * unit-testable and safe to import from anywhere. The request-bound glue lives
 * in ./access-server.ts.
 */

/** Cookie that carries the signed preview grant (set by /api/market/preview). */
export const MARKET_PREVIEW_COOKIE = "mkt_preview";

/**
 * The fixed message we HMAC to mint the preview token. Bumping the version
 * suffix (or rotating ANALYTICS_KEY) invalidates every previously-issued
 * preview cookie.
 */
const PREVIEW_TOKEN_MESSAGE = "sboxskins:market-preview:v1";

export type MarketAccessReason =
  | "public_open"
  | "preview_steamid"
  | "preview_cookie"
  | "gated";

export interface MarketAccessDecision {
  open: boolean;
  reason: MarketAccessReason;
}

export interface MarketAccessInput {
  /** MARKET_OPEN === "true" — the global launch switch. */
  marketOpen: boolean;
  /** Allowlisted 64-bit SteamIDs (from MARKET_PREVIEW_STEAMIDS). */
  previewSteamIds: ReadonlySet<string>;
  /** The signed-in user's SteamID, if any. */
  userSteamId?: string | null;
  /** Whether the request carried a valid preview cookie. */
  previewCookieValid: boolean;
}

/**
 * The one and only access decision. Pure — same inputs, same output.
 *
 * Rules (in order):
 *   1. marketOpen                          → open (public_open)
 *   2. userSteamId ∈ previewSteamIds       → open (preview_steamid)
 *   3. previewCookieValid                  → open (preview_cookie)
 *   4. otherwise                           → gated
 */
export function marketAccess(input: MarketAccessInput): MarketAccessDecision {
  if (input.marketOpen) return { open: true, reason: "public_open" };
  if (input.userSteamId && input.previewSteamIds.has(input.userSteamId)) {
    return { open: true, reason: "preview_steamid" };
  }
  if (input.previewCookieValid) return { open: true, reason: "preview_cookie" };
  return { open: false, reason: "gated" };
}

/** MARKET_OPEN is "open to everyone" only when the string is exactly "true". */
export function parseMarketOpen(raw: string | undefined | null): boolean {
  return raw === "true";
}

/**
 * Parse MARKET_PREVIEW_STEAMIDS — a comma/space-separated list of 64-bit
 * SteamIDs — into a trimmed, non-empty set. Tolerates trailing spaces, commas,
 * mixed separators, and blank entries.
 */
export function parsePreviewSteamIds(raw: string | undefined | null): Set<string> {
  if (!raw) return new Set();
  return new Set(
    raw
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
  );
}

/**
 * Mint the preview token: HMAC-SHA256 of a fixed message, keyed by the secret
 * (ANALYTICS_KEY). The cookie can't be forged without the key, and rotating the
 * key invalidates every outstanding preview.
 */
export function makePreviewToken(secret: string): string {
  return createHmac("sha256", secret).update(PREVIEW_TOKEN_MESSAGE).digest("hex");
}

/**
 * Constant-time verify of a preview token against the expected HMAC. Returns
 * false for a missing token, missing secret, or any mismatch.
 */
export function verifyPreviewToken(
  token: string | undefined | null,
  secret: string | undefined | null,
): boolean {
  if (!token || !secret) return false;
  const expected = makePreviewToken(secret);
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on differing lengths — guard first, still constant-
  // time for the equal-length (the interesting) case.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Thrown by the API-route gate when a caller isn't allowed in yet. Handlers map
 * it to a 403. Typed so callers can distinguish it from real errors.
 */
export class MarketGatedError extends Error {
  constructor(message = "The marketplace isn't open yet.") {
    super(message);
    this.name = "MarketGatedError";
  }
}
