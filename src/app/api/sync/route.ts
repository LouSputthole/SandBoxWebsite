import { NextRequest, NextResponse } from "next/server";
import { syncItems, syncPriceBatch, cleanupNonSteamItems } from "@/lib/services/sync-service";
import { checkPriceAlerts } from "@/lib/services/alert-service";
import { invalidatePattern } from "@/lib/redis/cache";

/**
 * POST /api/sync — Trigger a data sync from the Steam Market.
 *
 * Query params:
 *   mode=items   — Full item sync from Steam (default)
 *   mode=prices  — Price batch sync (faster, updates prices for existing items)
 *   mode=cleanup — Remove items that don't have a valid steamMarketId (mock data)
 *   fetchPrices=true — Also fetch detailed prices during item sync
 *
 * Protected by CRON_SECRET header (set in env).
 */
export async function POST(request: NextRequest) {
  // Verify authorization
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get("mode") || "items";
  const fetchPrices = searchParams.get("fetchPrices") === "true";

  try {
    let result;

    if (mode === "cleanup") {
      result = await cleanupNonSteamItems();
    } else if (mode === "prices") {
      const batchSize = parseInt(searchParams.get("batchSize") || "30");
      result = await syncPriceBatch(batchSize);
    } else {
      // "items" mode (default): sync from Steam API only — never falls back to mock data
      result = await syncItems(fetchPrices);
    }

    // Invalidate all cached data after sync
    if (result.success && (result.itemsProcessed > 0 || mode === "cleanup")) {
      const cleared = await invalidatePattern("items:*")
        + await invalidatePattern("item:*")
        + await invalidatePattern("prices:*");
      console.log(`[sync] Invalidated ${cleared} cache keys`);
    }

    // Check price alerts after sync
    if (result.success && result.itemsProcessed > 0) {
      const alertResult = await checkPriceAlerts();
      if (alertResult.triggered > 0) {
        console.log(`[sync] ${alertResult.triggered} price alerts triggered`);
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("[sync] Route error:", error);
    return NextResponse.json(
      { error: "Sync failed", details: String(error) },
      { status: 500 }
    );
  }
}

/**
 * GET /api/sync — Vercel Cron handler + health check.
 *
 * Vercel cron jobs send GET requests. When the cron secret matches,
 * this runs a full Steam API sync with prices.
 * Without auth, returns status info.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  // If authorized (Vercel cron or manual), run the sync
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    try {
      const result = await syncItems(true);

      // Invalidate cache
      if (result.success && result.itemsProcessed > 0) {
        const cleared = await invalidatePattern("items:*")
          + await invalidatePattern("item:*")
          + await invalidatePattern("prices:*");
        console.log(`[cron] Invalidated ${cleared} cache keys`);
      }

      // Check price alerts
      if (result.success && result.itemsProcessed > 0) {
        const alertResult = await checkPriceAlerts();
        if (alertResult.triggered > 0) {
          console.log(`[cron] ${alertResult.triggered} price alerts triggered`);
        }
      }

      return NextResponse.json(result);
    } catch (error) {
      console.error("[cron] Sync error:", error);
      return NextResponse.json(
        { error: "Sync failed", details: String(error) },
        { status: 500 }
      );
    }
  }

  // No auth — just return status
  return NextResponse.json({
    status: "ready",
    endpoints: {
      "GET /api/sync (with auth)": "Vercel cron — full Steam sync with prices",
      "POST /api/sync": "Full item sync from Steam Market (default)",
      "POST /api/sync?mode=prices": "Sync prices for existing items (batched)",
      "POST /api/sync?mode=cleanup": "Remove non-Steam items (mock data cleanup)",
      "POST /api/sync?mode=items&fetchPrices=true": "Full sync with detailed prices",
    },
  });
}
