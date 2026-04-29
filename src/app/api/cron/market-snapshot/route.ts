import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { median } from "@/lib/utils";

/**
 * GET/POST /api/cron/market-snapshot
 *
 * Lightweight aggregator that captures a MarketSnapshot row from the
 * current state of the Item table. NO Steam/sbox.dev API calls — just
 * sums of values we already store. Safe to run every 10 minutes.
 *
 * Why a separate cron from /api/sync:
 *   - /api/sync is the heavy "go pull from Steam" path that runs every
 *     15-30 min. It writes a snapshot at the end.
 *   - This route writes ONLY a snapshot, fast (one query + one insert).
 *     Lets us have a 10-minute candle resolution on the trends chart
 *     LIVE view without burning Steam API budget.
 *
 * Idempotency: writing a snapshot is just an append; running this twice
 * in the same minute is harmless (just two rows). Storage-cleanup
 * cron retains tier-1 (0-30d) raw rows so density is preserved for
 * the LIVE chart, then collapses to hourly + daily later.
 *
 * CRON_SECRET-gated. Body: none.
 */
async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();

  // Single query — pull the fields we aggregate over. ~80 rows, microseconds.
  const items = await prisma.item.findMany({
    select: {
      currentPrice: true,
      volume: true,
      totalSupply: true,
    },
  });

  const prices: number[] = [];
  let listingsValue = 0;
  let estMarketCap: number | null = null;
  let estCapAccum = 0;
  let estCapHits = 0;
  let totalVolume = 0;
  let totalSupply = 0;
  let totalSupplyAny = false;

  for (const i of items) {
    const price = i.currentPrice ?? 0;
    if (price > 0) prices.push(price);
    listingsValue += price * (i.volume ?? 0);
    totalVolume += i.volume ?? 0;
    if (i.totalSupply != null && i.totalSupply > 0) {
      totalSupply += i.totalSupply;
      totalSupplyAny = true;
      if (price > 0) {
        estCapAccum += price * i.totalSupply;
        estCapHits++;
      }
    }
  }
  if (estCapHits > 0) estMarketCap = estCapAccum;

  const avgPrice =
    prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;
  const sortedPrices = [...prices].sort((a, b) => a - b);

  await prisma.marketSnapshot.create({
    data: {
      totalItems: items.length,
      listingsValue,
      estMarketCap,
      avgPrice,
      medianPrice: median(prices),
      totalVolume,
      totalSupply: totalSupplyAny ? totalSupply : null,
      floor: sortedPrices.length > 0 ? sortedPrices[0] : null,
      ceiling:
        sortedPrices.length > 0
          ? sortedPrices[sortedPrices.length - 1]
          : null,
    },
  });

  return NextResponse.json({
    ok: true,
    items: items.length,
    listingsValue,
    estMarketCap,
    elapsedMs: Date.now() - startedAt,
  });
}

export const GET = handle;
export const POST = handle;
