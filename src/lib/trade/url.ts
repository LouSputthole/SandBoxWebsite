/**
 * Steam trade-offer URL helpers.
 *
 * Format: https://steamcommunity.com/tradeoffer/new/?partner=<AccountID32>&token=<8charToken>
 *
 * - `partner` is the 32-bit Steam Account ID, derived from the 64-bit SteamID:
 *     accountId32 = steamId64 - 76561197960265728
 * - `token` is an 8-char alphanumeric trade token from the user's privacy
 *   settings. Required for trades with non-friends.
 *
 * We validate that the partner ID derives from the *poster's* SteamID — so
 * users can't post someone else's trade URL and impersonate them.
 */

// BigInt() constructor — tsconfig targets ES2017 which doesn't have the
// `n` literal suffix.
const STEAM_ID_OFFSET = BigInt("76561197960265728");

export interface ParsedTradeUrl {
  partner: string; // AccountID32, decimal
  token: string; // 8-char trade token
}

/**
 * Parse and structurally validate a Steam trade URL. Returns null if the
 * URL doesn't conform — wrong host, missing partner/token, malformed token.
 */
export function parseTradeUrl(input: string): ParsedTradeUrl | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.hostname !== "steamcommunity.com") return null;
  if (!url.pathname.startsWith("/tradeoffer/new")) return null;

  const partner = url.searchParams.get("partner");
  const token = url.searchParams.get("token");
  if (!partner || !token) return null;

  // partner must be a positive 32-bit integer
  if (!/^\d+$/.test(partner)) return null;
  const partnerNum = Number(partner);
  if (!Number.isFinite(partnerNum) || partnerNum <= 0 || partnerNum > 2 ** 32) {
    return null;
  }
  // token is 8 alphanumeric chars (Steam's format)
  if (!/^[A-Za-z0-9_-]{6,12}$/.test(token)) return null;

  return { partner, token };
}

/**
 * Convert a SteamID64 (string of 17 digits) into the 32-bit AccountID
 * that appears in trade URLs. Returns null if the input doesn't look
 * like a valid SteamID64.
 */
export function steamIdToAccountId(steamId64: string): string | null {
  if (!/^\d{17}$/.test(steamId64)) return null;
  try {
    const account = BigInt(steamId64) - STEAM_ID_OFFSET;
    if (account <= BigInt(0)) return null;
    return account.toString();
  } catch {
    return null;
  }
}

/**
 * Validate a trade URL and confirm its `partner` derives from the given
 * SteamID. Returns the parsed URL if valid, null otherwise. This is the
 * one-shot helper API routes should call.
 */
export function validateTradeUrlForSteamId(
  input: string,
  steamId64: string,
): ParsedTradeUrl | null {
  const parsed = parseTradeUrl(input);
  if (!parsed) return null;
  const expected = steamIdToAccountId(steamId64);
  if (!expected || expected !== parsed.partner) return null;
  return parsed;
}

/**
 * Normalize a parsed trade URL back to canonical form. We store the
 * canonical version in the DB so we don't accidentally save URLs with
 * stray query params, fragment, or trailing slashes.
 */
export function canonicalTradeUrl(parsed: ParsedTradeUrl): string {
  return `https://steamcommunity.com/tradeoffer/new/?partner=${parsed.partner}&token=${parsed.token}`;
}
