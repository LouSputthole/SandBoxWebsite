import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis/client";

const STEAM_APPID = 590830;

/**
 * Simple IP-based rate limit via Redis. Falls open if Redis is down —
 * we'd rather serve inventory checks than block legitimate users.
 * Limit: 20 requests per IP per 10 minutes.
 */
async function rateLimit(ip: string): Promise<{ ok: boolean; remaining: number }> {
  if (!redis) return { ok: true, remaining: 20 };
  try {
    const key = `rl:inv:${ip}`;
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, 600);
    return { ok: count <= 20, remaining: Math.max(0, 20 - count) };
  } catch {
    return { ok: true, remaining: 20 };
  }
}

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

  // Rate limit per IP — prevent our proxy from being used as an open Steam
  // relay. 20 inventory lookups per 10 min is generous for real users.
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";
  const limit = await rateLimit(ip);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many requests. Try again in a few minutes." },
      { status: 429, headers: { "Retry-After": "60" } },
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
