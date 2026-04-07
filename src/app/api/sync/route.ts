import { NextRequest, NextResponse } from "next/server";
import { syncItems, syncPriceBatch, syncFromMockData } from "@/lib/services/sync-service";

/**
 * POST /api/sync — Trigger a data sync from the Steam Market.
 *
 * Query params:
 *   mode=items  — Full item sync (default)
 *   mode=prices — Price batch sync (faster, updates prices for existing items)
 *   mode=demo   — Sync from mock data (for testing the pipeline)
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
    if (mode === "demo") {
      const result = await syncFromMockData();
      return NextResponse.json(result);
    }

    if (mode === "prices") {
      const batchSize = parseInt(searchParams.get("batchSize") || "30");
      const result = await syncPriceBatch(batchSize);
      return NextResponse.json(result);
    }

    const result = await syncItems(fetchPrices);
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
 * GET /api/sync — Check sync status (health check).
 */
export async function GET() {
  return NextResponse.json({
    status: "ready",
    endpoints: {
      "POST /api/sync": "Full item sync from Steam Market",
      "POST /api/sync?mode=prices": "Sync prices for existing items (batched)",
      "POST /api/sync?mode=items&fetchPrices=true": "Full sync with detailed prices",
    },
  });
}
