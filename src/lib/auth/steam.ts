import { redis } from "@/lib/redis/client";

/**
 * Steam OpenID 2.0 authentication.
 *
 * Flow:
 * 1. Redirect user to Steam with our return URL
 * 2. Steam authenticates and redirects back with claimed_id
 * 3. We verify the assertion by POSTing back to Steam (this is the
 *    cryptographic check — Steam re-signs and confirms the assertion
 *    came from them)
 * 4. We additionally enforce that the assertion's signed-field list
 *    covers everything we depend on (nobody can shave a critical
 *    field out of the signature) and that nonce + return_to + op
 *    endpoint match what we'd accept
 * 5. Extract Steam ID from the claimed_id URL
 *
 * The defense-in-depth checks past Steam's own sig are belt-and-
 * suspenders — Steam's check_authentication call is the canonical
 * truth. But OpenID 2.0 has historical gotchas (signature shaving,
 * replay) and the cost of these extra checks is ~30 lines.
 */

const STEAM_OPENID_URL = "https://steamcommunity.com/openid/login";

/**
 * Fields we REQUIRE to be in `openid.signed`. If Steam ever returns an
 * assertion missing any of these from the signature scope, we reject —
 * an attacker could otherwise tamper with an unsigned field after the
 * fact. The full list of fields actually present in each assertion may
 * be larger; we only assert the floor.
 */
const REQUIRED_SIGNED_FIELDS = [
  "claimed_id",
  "identity",
  "return_to",
  "response_nonce",
  "assoc_handle",
  "op_endpoint",
] as const;

function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

function getCallbackUrl(): string {
  return `${getBaseUrl()}/api/auth/steam/callback`;
}

/**
 * Build the Steam OpenID login redirect URL.
 */
export function getSteamLoginUrl(): string {
  const baseUrl = getBaseUrl();
  const returnTo = getCallbackUrl();

  const params = new URLSearchParams({
    "openid.ns": "http://specs.openid.net/auth/2.0",
    "openid.mode": "checkid_setup",
    "openid.return_to": returnTo,
    "openid.realm": baseUrl,
    "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
    "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
  });

  return `${STEAM_OPENID_URL}?${params.toString()}`;
}

export interface SteamVerifyResult {
  ok: boolean;
  steamId: string | null;
  failureReason?: string;
}

/**
 * Atomically claim a nonce — returns true if this nonce has not been
 * seen before, false if it's a replay. Falls open (returns true) if
 * Redis is unavailable so a Redis outage doesn't lock everyone out;
 * Steam's own assertion-already-used check is still in play in that
 * window.
 */
async function claimNonce(nonce: string): Promise<boolean> {
  if (!redis) return true;
  try {
    // 24h TTL — Steam's assertion freshness window is way smaller, so
    // 24h is plenty of headroom for "did we see this exact nonce
    // recently."
    const key = `oid:nonce:${nonce}`;
    // SET with NX returns "OK" on first write, null if the key existed.
    const result = await redis.set(key, "1", { ex: 60 * 60 * 24, nx: true });
    return result === "OK";
  } catch {
    return true;
  }
}

/**
 * Verify the Steam OpenID assertion by checking back with Steam, then
 * applying our defense-in-depth checks. Returns a result object with
 * the steamId on success or a failure reason for the audit log.
 */
export async function verifySteamLogin(
  query: Record<string, string>,
): Promise<SteamVerifyResult> {
  // ---- Structural checks before the expensive round trip ----
  const claimedId = query["openid.claimed_id"];
  if (!claimedId) {
    return { ok: false, steamId: null, failureReason: "missing_claimed_id" };
  }
  const steamIdMatch = claimedId.match(
    /^https?:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/,
  );
  if (!steamIdMatch) {
    return { ok: false, steamId: null, failureReason: "claimed_id_format" };
  }
  const steamId = steamIdMatch[1];

  // op_endpoint must be Steam's actual login URL — defends against an
  // attacker pointing claimed_id at steamcommunity.com but routing the
  // sig-verify call somewhere else.
  if (query["openid.op_endpoint"] !== STEAM_OPENID_URL) {
    return { ok: false, steamId: null, failureReason: "op_endpoint_mismatch" };
  }

  // return_to must match exactly the URL we sent the user to. Steam
  // signs this field, so any mismatch already fails check_authentication
  // — but checking explicitly here gives us a cleaner audit reason.
  const expectedReturnTo = getCallbackUrl();
  const actualReturnTo = (query["openid.return_to"] ?? "").split("?")[0];
  if (actualReturnTo !== expectedReturnTo) {
    return { ok: false, steamId: null, failureReason: "return_to_mismatch" };
  }

  // openid.signed lists which fields are covered by the signature.
  // Reject anything missing the fields we depend on — otherwise an
  // attacker could send a partially-signed assertion with our trust
  // fields tampered.
  const signed = (query["openid.signed"] ?? "").split(",").filter(Boolean);
  for (const required of REQUIRED_SIGNED_FIELDS) {
    if (!signed.includes(required)) {
      return {
        ok: false,
        steamId: null,
        failureReason: `signed_missing:${required}`,
      };
    }
  }

  // Nonce replay defense — claim before round trip so concurrent
  // replays still race to one winner.
  const nonce = query["openid.response_nonce"];
  if (!nonce) {
    return { ok: false, steamId: null, failureReason: "missing_nonce" };
  }
  if (!(await claimNonce(nonce))) {
    return { ok: false, steamId: null, failureReason: "nonce_replay" };
  }

  // ---- Steam's own signature verification (canonical truth) ----
  const verifyParams = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    verifyParams.set(key, value);
  }
  verifyParams.set("openid.mode", "check_authentication");

  try {
    const res = await fetch(STEAM_OPENID_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: verifyParams.toString(),
    });

    const text = await res.text();
    if (text.includes("is_valid:true")) {
      return { ok: true, steamId };
    }
    return { ok: false, steamId: null, failureReason: "steam_invalid" };
  } catch (error) {
    console.error("[auth] Steam verification failed:", error);
    return { ok: false, steamId: null, failureReason: "steam_network_error" };
  }
}

/**
 * Fetch Steam user profile info using the Steam Web API.
 * Returns username and avatar if available.
 */
export async function fetchSteamProfile(steamId: string): Promise<{
  username: string | null;
  avatarUrl: string | null;
  profileUrl: string | null;
}> {
  const apiKey = process.env.STEAM_API_KEY;

  if (apiKey) {
    try {
      const res = await fetch(
        `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${apiKey}&steamids=${steamId}`,
        { signal: AbortSignal.timeout(10000) },
      );

      if (res.ok) {
        const data = await res.json();
        const player = data?.response?.players?.[0];
        if (player) {
          return {
            username: player.personaname || null,
            avatarUrl: player.avatarfull || player.avatar || null,
            profileUrl: player.profileurl || null,
          };
        }
      }
    } catch {
      // Fall through to XML fallback
    }
  }

  // Fallback: try XML profile (no API key needed, but may be blocked from data center IPs)
  try {
    const res = await fetch(
      `https://steamcommunity.com/profiles/${steamId}?xml=1`,
      { signal: AbortSignal.timeout(10000) },
    );

    if (res.ok) {
      const xml = await res.text();
      const nameMatch = xml.match(/<steamID><!\[CDATA\[(.*?)\]\]><\/steamID>/);
      const avatarMatch = xml.match(
        /<avatarFull><!\[CDATA\[(.*?)\]\]><\/avatarFull>/,
      );

      return {
        username: nameMatch?.[1] || null,
        avatarUrl: avatarMatch?.[1] || null,
        profileUrl: `https://steamcommunity.com/profiles/${steamId}`,
      };
    }
  } catch {
    // Can't fetch profile, that's okay
  }

  return {
    username: null,
    avatarUrl: null,
    profileUrl: `https://steamcommunity.com/profiles/${steamId}`,
  };
}
