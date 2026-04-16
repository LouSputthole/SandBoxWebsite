import { NextRequest, NextResponse } from "next/server";
import { searchMarketByQuery } from "@/lib/steam/client";
import { upsertItem } from "@/lib/services/sync-service";
import type { SyncResult } from "@/lib/steam/types";

/**
 * POST /api/admin/seed-item
 *
 * Body: { marketHashName: string }
 *
 * Manually seed a single item by its Steam market_hash_name. The paginated
 * catalog sync is occasionally lossy (Steam's pagination can drop items
 * between pages and we have no secondary listing source), so when we
 * notice a missing item this is the escape hatch.
 *
 * Hits the Steam search API filtered by name, locates the exact-match
 * result, and runs it through the same upsert path as the regular sync
 * (same slugify, same type inference, same description generator). The
 * next scheduled sync will then pick up the new row normally.
 *
 * Protected by CRON_SECRET header.
 */
export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { marketHashName?: string };
  try {
    body = (await request.json()) as { marketHashName?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const hashName = body.marketHashName?.trim();
  if (!hashName) {
    return NextResponse.json(
      { error: "marketHashName is required" },
      { status: 400 },
    );
  }
  if (hashName.length > 200) {
    return NextResponse.json(
      { error: "marketHashName is too long (max 200)" },
      { status: 400 },
    );
  }

  const search = await searchMarketByQuery(hashName, 20);
  if (!search || !search.success) {
    return NextResponse.json(
      { error: "Steam search failed or returned no results" },
      { status: 502 },
    );
  }

  // Exact hash_name match — avoids pulling in "Hard Hat 2026" if we asked
  // for "Hard Hat". Case-insensitive comparison because Steam's own hash
  // names are occasionally inconsistent.
  const match = search.results.find(
    (r) => r.hash_name.toLowerCase() === hashName.toLowerCase(),
  );
  if (!match) {
    return NextResponse.json(
      {
        error: `No exact match for "${hashName}" in Steam search. First few results: ${search.results
          .slice(0, 5)
          .map((r) => r.hash_name)
          .join(", ")}`,
      },
      { status: 404 },
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

  const itemId = await upsertItem(match, result);
  if (!itemId) {
    return NextResponse.json(
      { error: "Upsert failed", detail: result.errors },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    itemId,
    created: result.itemsCreated === 1,
    updated: result.itemsUpdated === 1,
    name: match.name,
    hashName: match.hash_name,
  });
}
