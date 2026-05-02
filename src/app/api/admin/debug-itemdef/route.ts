import { NextRequest, NextResponse } from "next/server";
import { guardAdminRoute } from "@/lib/auth/admin-guard";
import {
  fetchSteamItemDefs,
  parseSteamPrice,
  pickItemDescription,
} from "@/lib/steam/inventory";

/**
 * GET /api/admin/debug-itemdef[?itemdefid=496279]
 *
 * Pulls the Steam item-def archive and returns either:
 *   - one specific itemdef's parsed shape (when ?itemdefid is given)
 *   - a summary + sample of the first 10 defs (no param)
 *
 * Lets us verify the Steamworks integration before turning on the
 * daily sync, plus diagnose "why didn't this item's price fill in"
 * for a specific Crash Test Dummy / Cat Balaclava etc.
 */
export async function GET(request: NextRequest) {
  const guard = await guardAdminRoute(request, {
    allowedKeys: ["analytics", "cron"],
  });
  if (!guard.ok) return guard.response;

  const archive = await fetchSteamItemDefs();
  if (!archive) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "fetch failed — check STEAM_API_KEY env var or Steam Web API status",
      },
      { status: 502 },
    );
  }

  const param = request.nextUrl.searchParams.get("itemdefid");
  if (param) {
    const id = Number(param);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "itemdefid must be numeric" }, { status: 400 });
    }
    const def = archive.defsByItemdefid.get(id);
    if (!def) {
      return NextResponse.json({
        digest: archive.digest,
        archiveSize: archive.defsByItemdefid.size,
        itemdefid: id,
        found: false,
      });
    }
    return NextResponse.json({
      digest: archive.digest,
      archiveSize: archive.defsByItemdefid.size,
      itemdefid: id,
      found: true,
      raw: def,
      parsed: {
        priceUsd: parseSteamPrice(def.price, "USD"),
        description: pickItemDescription(def),
      },
    });
  }

  const sample = [...archive.defsByItemdefid.values()].slice(0, 10).map((d) => ({
    itemdefid: d.itemdefid,
    name: d.name,
    description: pickItemDescription(d),
    priceUsd: parseSteamPrice(d.price, "USD"),
    rawPrice: d.price,
  }));

  return NextResponse.json({
    digest: archive.digest,
    archiveSize: archive.defsByItemdefid.size,
    sample,
  });
}
