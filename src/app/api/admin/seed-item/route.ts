import { NextRequest, NextResponse } from "next/server";
import {
  seedItemByHashName,
  seedItemFromSboxDev,
} from "@/lib/services/sync-service";
import type { SyncResult } from "@/lib/steam/types";
import { guardAdminRoute } from "@/lib/auth/admin-guard";
import { slugify } from "@/lib/utils";

/**
 * POST /api/admin/seed-item
 *
 * Body:
 *   { query: string, source?: "auto" | "steam" | "sboxdev" }
 *
 * - source="steam":   require an exact-name match on Steam Market.
 * - source="sboxdev": treat query as a sbox.dev slug or URL.
 * - source="auto" (default): try Steam first, fall back to sbox.dev
 *   on miss. Best for items that may not be on Steam Market yet.
 *
 * Backwards compat: if the body has `marketHashName` instead of
 * `query`, treat it as a Steam-only seed (the original behavior).
 *
 * Protected by CRON_SECRET / ANALYTICS_KEY admin guard.
 */
export async function POST(request: NextRequest) {
  const guard = await guardAdminRoute(request, {
    allowedKeys: ["cron", "analytics"],
  });
  if (!guard.ok) return guard.response;

  let body: { query?: string; marketHashName?: string; source?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Backwards compat with the original endpoint shape.
  const query = (body.query ?? body.marketHashName ?? "").trim();
  const source = (body.source ?? (body.marketHashName ? "steam" : "auto")) as
    | "auto"
    | "steam"
    | "sboxdev";

  if (!query) {
    return NextResponse.json(
      { error: "query is required" },
      { status: 400 },
    );
  }
  if (query.length > 200) {
    return NextResponse.json(
      { error: "query is too long (max 200)" },
      { status: 400 },
    );
  }

  const result: SyncResult = {
    success: true,
    itemsProcessed: 0,
    itemsCreated: 0,
    itemsUpdated: 0,
    pricePointsCreated: 0,
    errors: [],
    duration: 0,
  };

  const tried: string[] = [];

  // Steam Market path — exact-name search.
  if (source === "steam" || source === "auto") {
    tried.push("steam");
    const steam = await seedItemByHashName(query, result);
    if (steam.itemId) {
      return NextResponse.json({
        success: true,
        source: "steam",
        itemId: steam.itemId,
        slug: steam.slug,
        name: steam.matchedName,
        created: result.itemsCreated === 1,
        updated: result.itemsUpdated === 1,
      });
    }
  }

  // sbox.dev path — accepts a bare slug, a slugified name, or a
  // sbox.dev URL. Helpful for items not (yet) on the Market.
  if (source === "sboxdev" || source === "auto") {
    tried.push("sboxdev");
    // For "auto" mode the user typed a name like "Hard Hat" — slugify
    // before passing to sbox.dev. For explicit "sboxdev" mode trust
    // them to have given a slug-like input.
    const slugAttempt =
      source === "auto" ? slugify(query) : query;
    const sbox = await seedItemFromSboxDev(slugAttempt, result);
    if (sbox.itemId) {
      return NextResponse.json({
        success: true,
        source: "sboxdev",
        itemId: sbox.itemId,
        slug: sbox.slug,
        name: sbox.matchedName,
        created: result.itemsCreated === 1,
        updated: result.itemsUpdated === 1,
      });
    }
  }

  return NextResponse.json(
    {
      error: `No match for "${query}" via ${tried.join(" + ")}.`,
      hint:
        "Try a different name (Steam is exact-match), or paste the sbox.dev slug or URL directly. Items not yet on Steam Market can only be seeded from sbox.dev.",
    },
    { status: 404 },
  );
}
