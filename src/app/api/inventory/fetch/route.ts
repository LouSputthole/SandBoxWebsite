import { NextRequest, NextResponse } from "next/server";

const STEAM_APPID = 590830;

/**
 * GET /api/inventory/fetch?steamid=76561198...
 *
 * Server-side proxy for Steam's inventory JSON endpoint. Fetching directly
 * from the browser fails CORS (Steam doesn't set Access-Control-Allow-Origin
 * on their inventory endpoints); going through our API sidesteps that and
 * Steam's JSON endpoints work fine from Vercel IPs.
 *
 * Returns the raw Steam response so the existing client-side parser doesn't
 * need to change.
 */
export async function GET(request: NextRequest) {
  const steamid = request.nextUrl.searchParams.get("steamid");

  if (!steamid) {
    return NextResponse.json(
      { error: "Missing 'steamid' query parameter" },
      { status: 400 },
    );
  }
  // Basic validation — SteamID64 is always a 17-digit number starting with 7656
  if (!/^\d{17}$/.test(steamid)) {
    return NextResponse.json(
      { error: "steamid must be a 17-digit SteamID64" },
      { status: 400 },
    );
  }

  // count=5000 is rejected by Steam with HTTP 400. Steam's documented max is 2000.
  const upstream = `https://steamcommunity.com/inventory/${steamid}/${STEAM_APPID}/2?l=english&count=2000`;

  let res: Response;
  try {
    res = await fetch(upstream, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/json, text/javascript, */*; q=0.01",
      },
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "Network error reaching Steam",
        details: String(err),
      },
      { status: 502 },
    );
  }

  // Steam returns 403 for private inventories / hidden profiles
  if (res.status === 403) {
    return NextResponse.json(
      {
        error:
          "Steam returned 403 (Forbidden). Profile or inventory may be private. On Steam: Edit Profile → Privacy Settings → set Profile, Game Details, AND Inventory to Public.",
      },
      { status: 403 },
    );
  }

  if (res.status === 429) {
    return NextResponse.json(
      { error: "Steam is rate-limiting. Try again in a minute." },
      { status: 429 },
    );
  }

  // Steam sometimes returns non-200 (e.g. 400) but with valid inventory JSON.
  // Always try to parse the body — only bail if it's not valid inventory data.
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return NextResponse.json(
      { error: `Steam returned HTTP ${res.status} with non-JSON body` },
      { status: 502 },
    );
  }

  const obj = data as Record<string, unknown>;
  if (!res.ok && obj?.success !== 1 && obj?.success !== true) {
    return NextResponse.json(
      { error: `Steam returned HTTP ${res.status}` },
      { status: 502 },
    );
  }

  return NextResponse.json(data);
}
