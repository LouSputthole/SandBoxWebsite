import { NextRequest, NextResponse } from "next/server";
import { parseSteamProfileUrl, resolveVanityUrl } from "@/lib/steam/client";
import { redis } from "@/lib/redis/client";

/**
 * Per-IP rate limit. Vanity resolution hits Steam once per request, so this
 * is a potential open relay. 30 resolutions per IP per 10 min is plenty for
 * legitimate users. Fails open if Redis is unavailable.
 */
async function rateLimit(ip: string): Promise<boolean> {
  if (!redis) return true;
  try {
    const key = `rl:inv-resolve:${ip}`;
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, 600);
    return count <= 30;
  } catch {
    return true;
  }
}

/**
 * GET /api/inventory/resolve?url=<steam_profile_url>
 *
 * Resolves a Steam profile URL or vanity name to a SteamID64.
 * This is the only server-side call needed for the inventory flow — the
 * actual inventory fetch happens client-side to bypass Vercel IP blocks.
 */
export async function GET(request: NextRequest) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";
  if (!(await rateLimit(ip))) {
    return NextResponse.json(
      { error: "Too many requests. Try again in a few minutes." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const profileInput = request.nextUrl.searchParams.get("url");
  if (!profileInput) {
    return NextResponse.json({ error: "Missing 'url' parameter" }, { status: 400 });
  }

  const parsed = parseSteamProfileUrl(profileInput);
  if (!parsed) {
    return NextResponse.json(
      { error: "Invalid Steam profile URL. Use https://steamcommunity.com/profiles/STEAMID64 or https://steamcommunity.com/id/VANITYNAME" },
      { status: 400 }
    );
  }

  let steamid64 = parsed.steamid64;
  if (!steamid64 && parsed.vanityName) {
    steamid64 = (await resolveVanityUrl(parsed.vanityName)) ?? undefined;
    if (!steamid64) {
      return NextResponse.json(
        { error: `Could not resolve Steam profile "${parsed.vanityName}". Make sure the profile URL is correct.` },
        { status: 404 }
      );
    }
  }

  if (!steamid64) {
    return NextResponse.json({ error: "Could not determine SteamID64" }, { status: 400 });
  }

  return NextResponse.json({ steamid64 });
}
