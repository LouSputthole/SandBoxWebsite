import { prisma } from "@/lib/db";
import { fetchItemNameId } from "@/lib/steam/client";

/**
 * Backfill Item.steamItemNameId — the numeric Steam ID required by the
 * order-histogram endpoint that powers buy/sell orders on item pages.
 *
 * An item is eligible once it has a steamMarketId (i.e. it's listed on the
 * Steam Market) but no nameid yet. We scrape the nameid from the listing
 * page (fetchItemNameId), newest-drops-first, and stamp
 * steamItemNameIdCheckedAt on every attempt so that:
 *   - brand-new drops jump the queue (never-checked first, then newest), and
 *   - chronically-unfetchable items (delisted, name mismatch) are retried at
 *     most once per RETRY_BACKOFF_MS instead of re-consuming the per-run
 *     budget every pass and starving the new drops behind them.
 *
 * Shared by the dedicated 6h cron (large batch) and the /api/sync cron
 * (small top-up each cycle, so new drops get an order book within minutes).
 */

// Space requests out to stay friendly with Steam's HTML endpoint.
const DELAY_MS = 2000;
// Don't re-attempt a failed nameid more often than this.
const RETRY_BACKOFF_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export interface NameIdBackfillResult {
  attempted: number;
  updated: number;
  failed: number;
  remaining: number;
  failures: { name: string; reason: string }[];
}

export async function backfillItemNameIds(
  limit: number,
): Promise<NameIdBackfillResult> {
  const now = new Date();
  const retryCutoff = new Date(now.getTime() - RETRY_BACKOFF_MS);

  const items = await prisma.item.findMany({
    where: {
      steamMarketId: { not: null },
      steamItemNameId: null,
      OR: [
        { steamItemNameIdCheckedAt: null },
        { steamItemNameIdCheckedAt: { lt: retryCutoff } },
      ],
    },
    select: { id: true, name: true, steamMarketId: true },
    // Never-attempted items first, then newest drops — so a fresh drop is
    // always served before old, repeatedly-failing rows.
    orderBy: [
      { steamItemNameIdCheckedAt: { sort: "asc", nulls: "first" } },
      { createdAt: "desc" },
    ],
    take: limit,
  });

  let updated = 0;
  let failed = 0;
  const failures: { name: string; reason: string }[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    let nameId: string | null = null;
    let reason = "nameid not found in listing HTML";
    try {
      nameId = await fetchItemNameId(item.steamMarketId!);
    } catch (err) {
      reason = err instanceof Error ? err.message : String(err);
    }

    // Stamp the attempt either way (drives the backoff); set the nameid on success.
    await prisma.item.update({
      where: { id: item.id },
      data: {
        steamItemNameIdCheckedAt: now,
        ...(nameId ? { steamItemNameId: nameId } : {}),
      },
    });

    if (nameId) {
      updated++;
    } else {
      failed++;
      failures.push({ name: item.name, reason });
    }

    if (i < items.length - 1) await sleep(DELAY_MS);
  }

  const remaining = await prisma.item.count({
    where: { steamMarketId: { not: null }, steamItemNameId: null },
  });

  return { attempted: items.length, updated, failed, remaining, failures };
}
