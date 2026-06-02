import { NextRequest, NextResponse } from "next/server";
import { backfillItemNameIds } from "@/lib/steam/nameids";
import { guardAdminRoute } from "@/lib/auth/admin-guard";

/**
 * GET/POST /api/cron/scrape-nameids
 *
 * Backfills Item.steamItemNameId for items that have a steamMarketId but no
 * nameid yet. The numeric nameid is required for Steam's order-histogram
 * endpoint (buy/sell orders on item detail pages).
 *
 * Selection is newest-first with a retry backoff (see backfillItemNameIds),
 * so brand-new drops jump the queue and chronically-unfetchable items can't
 * starve it. Capped at MAX_PER_RUN per call to stay inside the function
 * timeout. Runs every 6h (vercel.json); the /api/sync cron also tops up a
 * few each cycle so new drops get an order book within minutes.
 *
 * Auth: accepts either CRON_SECRET (Vercel cron) or ANALYTICS_KEY
 * (operator triggering from /admin/scrape-nameids).
 */
export const maxDuration = 300;

// ~75 × 2s spacing ≈ 150s, comfortably inside maxDuration.
const MAX_PER_RUN = 75;

async function handle(request: NextRequest) {
  const guard = await guardAdminRoute(request, {
    allowedKeys: ["cron", "analytics"],
  });
  if (!guard.ok) return guard.response;

  const startedAt = Date.now();
  const result = await backfillItemNameIds(MAX_PER_RUN);

  return NextResponse.json({
    ok: result.failed === 0,
    ...result,
    elapsedMs: Date.now() - startedAt,
  });
}

export const GET = handle;
export const POST = handle;
