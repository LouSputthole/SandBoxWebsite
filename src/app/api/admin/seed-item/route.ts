import { NextRequest, NextResponse } from "next/server";
import { seedItemByHashName } from "@/lib/services/sync-service";
import type { SyncResult } from "@/lib/steam/types";
import { guardAdminRoute } from "@/lib/auth/admin-guard";

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
  const guard = await guardAdminRoute(request, { allowedKeys: ["cron"] });
  if (!guard.ok) return guard.response;

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

  const result: SyncResult = {
    success: true,
    itemsProcessed: 0,
    itemsCreated: 0,
    itemsUpdated: 0,
    pricePointsCreated: 0,
    errors: [],
    duration: 0,
  };

  const { itemId, matchedName } = await seedItemByHashName(hashName, result);
  if (!itemId) {
    return NextResponse.json(
      {
        error: `No exact match for "${hashName}" in Steam search, or upsert failed.`,
        detail: result.errors,
      },
      { status: 404 },
    );
  }

  return NextResponse.json({
    success: true,
    itemId,
    created: result.itemsCreated === 1,
    updated: result.itemsUpdated === 1,
    name: matchedName,
    hashName,
  });
}
