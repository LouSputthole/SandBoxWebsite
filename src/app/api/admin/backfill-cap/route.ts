import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * Backfill historical estMarketCap on MarketSnapshot rows using real data.
 *
 * Method:
 *  - For each snapshot with estMarketCap == null:
 *    - For each item with releaseDate + totalSupply known:
 *      - Skip if snapshot timestamp is before item release (didn't exist yet)
 *      - Estimate supply at snapshot time: linear interpolation between
 *        0 at release date and totalSupply today
 *      - Find that item's price closest to snapshot timestamp (from
 *        PricePoint history) — fall back to current price if no history
 *      - value = estimated_price × estimated_supply
 *    - Sum all item values → estMarketCap for the snapshot
 *
 * This is way better than a flat ratio because items released last week
 * shouldn't contribute to a market cap from a month ago.
 *
 * POST /api/admin/backfill-cap — requires CRON_SECRET or ANALYTICS_KEY auth.
 */
export async function POST(request: NextRequest) {
  const key =
    request.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
  if (
    key !== process.env.CRON_SECRET &&
    key !== process.env.ANALYTICS_KEY
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = Date.now();

  // Pull everything we need in 3 queries
  const [items, allPricePoints, nullSnapshots] = await Promise.all([
    prisma.item.findMany({
      where: {
        totalSupply: { not: null, gt: 0 },
        currentPrice: { not: null, gt: 0 },
      },
      select: {
        id: true,
        currentPrice: true,
        totalSupply: true,
        releaseDate: true,
      },
    }),
    prisma.pricePoint.findMany({
      select: { itemId: true, price: true, timestamp: true },
      orderBy: { timestamp: "asc" },
    }),
    prisma.marketSnapshot.findMany({
      where: { estMarketCap: null },
      select: { id: true, timestamp: true, listingsValue: true },
      orderBy: { timestamp: "asc" },
    }),
  ]);

  if (items.length === 0 || nullSnapshots.length === 0) {
    return NextResponse.json({
      snapshotsUpdated: 0,
      message: "Nothing to backfill",
    });
  }

  // Index price points by item for fast lookup
  const pointsByItem = new Map<string, { ts: number; price: number }[]>();
  for (const p of allPricePoints) {
    const arr = pointsByItem.get(p.itemId) ?? [];
    arr.push({ ts: p.timestamp.getTime(), price: p.price });
    pointsByItem.set(p.itemId, arr);
  }

  /**
   * Find price for an item at or near a target timestamp. Uses binary-ish
   * scan — the arrays are already sorted by timestamp. Falls back to the
   * item's current price if no historical point is within 14 days.
   */
  function priceAt(itemId: string, targetTs: number, fallback: number): number {
    const points = pointsByItem.get(itemId);
    if (!points || points.length === 0) return fallback;
    let best = points[0];
    let bestDelta = Math.abs(best.ts - targetTs);
    for (const p of points) {
      const d = Math.abs(p.ts - targetTs);
      if (d < bestDelta) {
        best = p;
        bestDelta = d;
      }
    }
    // If the closest point is more than 14 days away, fall back to current
    if (bestDelta > 14 * 24 * 60 * 60 * 1000) return fallback;
    return best.price;
  }

  // Track metrics
  let updated = 0;
  let totalContributingItems = 0;

  for (const snap of nullSnapshots) {
    const snapTs = snap.timestamp.getTime();
    let estCap = 0;
    let contributors = 0;

    for (const item of items) {
      const releaseTs = item.releaseDate?.getTime();
      // If we don't know release, assume the item existed (be inclusive)
      const existedAtSnap = releaseTs == null || releaseTs <= snapTs;
      if (!existedAtSnap) continue;

      const totalSupply = item.totalSupply!;
      const currentPrice = item.currentPrice!;

      // Estimate supply at snapshot time. Assume linear growth from 0 at
      // release to totalSupply today. Items with no release date → assume
      // they existed at full supply back then.
      let estimatedSupply: number;
      if (releaseTs == null) {
        estimatedSupply = totalSupply;
      } else {
        const totalLifespan = now - releaseTs;
        if (totalLifespan <= 0) {
          estimatedSupply = totalSupply;
        } else {
          const ageAtSnap = Math.max(0, snapTs - releaseTs);
          estimatedSupply = Math.round(totalSupply * (ageAtSnap / totalLifespan));
        }
      }

      if (estimatedSupply <= 0) continue;

      const estimatedPrice = priceAt(item.id, snapTs, currentPrice);
      estCap += estimatedPrice * estimatedSupply;
      contributors++;
    }

    if (estCap > 0) {
      await prisma.marketSnapshot.update({
        where: { id: snap.id },
        data: { estMarketCap: estCap },
      });
      updated++;
      totalContributingItems += contributors;
    }
  }

  return NextResponse.json({
    snapshotsUpdated: updated,
    totalSnapshots: nullSnapshots.length,
    itemsUsed: items.length,
    avgContributorsPerSnapshot: updated > 0 ? Math.round(totalContributingItems / updated) : 0,
    method: "per-snapshot supply interpolation + price history lookup",
  });
}
