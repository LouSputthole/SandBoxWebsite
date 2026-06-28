import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// ponytail: mirrors the 7d-spark logic in src/app/leaderboard/page.tsx
// (same window + even-thinning) so the watchlist + leaderboard sparklines
// stay visually consistent. Extract to a shared helper if a third caller appears.
const SPARK_DAYS = 7;
const SPARK_MAX_POINTS = 24;

/** Evenly thin a series so the sparkline payload stays small per row. */
function downsample(values: number[], max = SPARK_MAX_POINTS): number[] {
  if (values.length <= max) return values;
  const step = (values.length - 1) / (max - 1);
  const out: number[] = [];
  for (let i = 0; i < max; i++) out.push(values[Math.round(i * step)]);
  return out;
}

export async function POST(request: NextRequest) {
  try {
    const { slugs } = (await request.json()) as { slugs: string[] };

    if (!Array.isArray(slugs) || slugs.length === 0) {
      return NextResponse.json({ items: [], totalValue: 0 });
    }

    // Cap at 100 items
    const capped = slugs.slice(0, 100);

    const items = await prisma.item.findMany({
      where: { slug: { in: capped } },
      select: {
        id: true,
        name: true,
        slug: true,
        type: true,
        imageUrl: true,
        currentPrice: true,
        lowestPrice: true,
        medianPrice: true,
        priceChange24h: true,
        volume: true,
        isLimited: true,
        storeStatus: true,
        rarityColor: true,
      },
    });

    // Real last-7d price series per item for the inline sparkline. One query
    // for every watched item, grouped into per-item series (asc by time).
    // Items without ≥2 points just get an empty array; the UI renders "—".
    const ids = items.map((i) => i.id);
    const since = new Date(Date.now() - SPARK_DAYS * 24 * 60 * 60 * 1000);
    const points = ids.length
      ? await prisma.pricePoint.findMany({
          where: { itemId: { in: ids }, timestamp: { gte: since } },
          select: { itemId: true, price: true },
          orderBy: { timestamp: "asc" },
        })
      : [];

    const seriesByItem = new Map<string, number[]>();
    for (const p of points) {
      const arr = seriesByItem.get(p.itemId);
      if (arr) arr.push(p.price);
      else seriesByItem.set(p.itemId, [p.price]);
    }

    const itemsWithSpark = items.map((it) => ({
      ...it,
      spark7d: downsample(seriesByItem.get(it.id) ?? []),
    }));

    const totalValue = items.reduce(
      (sum, item) => sum + (item.currentPrice ?? 0),
      0,
    );

    const totalChange = items.reduce(
      (sum, item) => sum + (item.priceChange24h ?? 0),
      0,
    );

    const gainers = items
      .filter((i) => (i.priceChange24h ?? 0) > 0)
      .sort((a, b) => (b.priceChange24h ?? 0) - (a.priceChange24h ?? 0));

    const losers = items
      .filter((i) => (i.priceChange24h ?? 0) < 0)
      .sort((a, b) => (a.priceChange24h ?? 0) - (b.priceChange24h ?? 0));

    return NextResponse.json({
      items: itemsWithSpark,
      totalValue,
      totalChange,
      itemCount: items.length,
      gainers: gainers.length,
      losers: losers.length,
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch portfolio" },
      { status: 500 },
    );
  }
}
