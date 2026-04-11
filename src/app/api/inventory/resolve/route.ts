import { NextRequest, NextResponse } from "next/server";
import { parseSteamProfileUrl, resolveVanityUrl } from "@/lib/steam/client";

/**
 * GET /api/inventory/resolve?url=<steam_profile_url>
 *
 * Resolves a Steam profile URL or vanity name to a SteamID64.
 * This is the only server-side call needed for the inventory flow — the
 * actual inventory fetch happens client-side to bypass Vercel IP blocks.
 */
export async function GET(request: NextRequest) {
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
