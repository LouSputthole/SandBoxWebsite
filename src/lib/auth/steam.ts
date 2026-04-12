/**
 * Steam OpenID 2.0 authentication.
 *
 * Flow:
 * 1. Redirect user to Steam with our return URL
 * 2. Steam authenticates and redirects back with claimed_id
 * 3. We verify the assertion by POSTing back to Steam
 * 4. Extract Steam ID from the claimed_id URL
 */

const STEAM_OPENID_URL = "https://steamcommunity.com/openid/login";

function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

/**
 * Build the Steam OpenID login redirect URL.
 */
export function getSteamLoginUrl(): string {
  const baseUrl = getBaseUrl();
  const returnTo = `${baseUrl}/api/auth/steam/callback`;

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

/**
 * Verify the Steam OpenID assertion by checking back with Steam.
 * Returns the Steam ID (64-bit) if valid, null otherwise.
 */
export async function verifySteamLogin(
  query: Record<string, string>,
): Promise<string | null> {
  // The claimed_id should contain the Steam ID
  const claimedId = query["openid.claimed_id"];
  if (!claimedId) return null;

  // Extract Steam ID from URL like https://steamcommunity.com/openid/id/76561198012345678
  const steamIdMatch = claimedId.match(
    /^https?:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/,
  );
  if (!steamIdMatch) return null;

  // Verify the assertion with Steam
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
      return steamIdMatch[1];
    }
  } catch (error) {
    console.error("[auth] Steam verification failed:", error);
  }

  return null;
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
