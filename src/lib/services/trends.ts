import { prisma } from "@/lib/db";
import { median } from "@/lib/utils";

/**
 * Trends data fetcher — pulls market snapshots, item breakdowns, and top
 * movers in a single parallel batch. Used by both the /trends server-rendered
 * page and the /api/trends client API.
 */

export type TrendsPeriod = "7d" | "30d" | "90d" | "all";

export interface TrendsData {
  currentStats: {
    totalItems: number;
    listingsValue: number; // sum(currentPrice * activeListings) — value of all active listings
    estMarketCap: number;  // sum(currentPrice * totalSupply) across items with known supply
    estMarketCapItemCount: number; // how many items contributed to estMarketCap
    avgPrice: number;
    medianPrice: number;
    totalVolume: number;
    totalSupply: number;
    floor: number;
    ceiling: number;
  };
  snapshots: {
    timestamp: Date;
    listingsValue: number;
    estMarketCap: number | null;
    avgPrice: number;
    totalVolume: number;
    totalItems: number;
    totalSupply: number | null;
    floor: number | null;
    ceiling: number | null;
  }[];
  typeBreakdown: Record<
    string,
    { count: number; totalValue: number; avgPrice: number }
  >;
  storeStatusCounts: { available: number; delisted: number; unknown: number };
  topGainers: {
    name: string;
    slug: string;
    imageUrl: string | null;
    type: string;
    currentPrice: number | null;
    priceChange24h: number | null;
    volume: number | null;
  }[];
  topLosers: {
    name: string;
    slug: string;
    imageUrl: string | null;
    type: string;
    currentPrice: number | null;
    priceChange24h: number | null;
    volume: number | null;
  }[];
  topGainers7d: WeeklyMover[];
  topLosers7d: WeeklyMover[];
}

export interface WeeklyMover {
  name: string;
  slug: string;
  imageUrl: string | null;
  type: string;
  currentPrice: number | null;
  weeklyChangePct: number;
  weekAgoPrice: number;
  volume: number | null;
}

export function periodDays(period: TrendsPeriod): number {
  return period === "7d" ? 7 : period === "90d" ? 90 : period === "all" ? 365 : 30;
}

export async function getTrendsData(period: TrendsPeriod): Promise<TrendsData> {
  const since = new Date(Date.now() - periodDays(period) * 24 * 60 * 60 * 1000);

  const [snapshots, items, topGainers, topLosers] = await Promise.all([
    prisma.marketSnapshot.findMany({
      where: { timestamp: { gte: since } },
      orderBy: { timestamp: "asc" },
      select: {
        timestamp: true,
        listingsValue: true,
        estMarketCap: true,
        avgPrice: true,
        totalVolume: true,
        totalItems: true,
        totalSupply: true,
        floor: true,
        ceiling: true,
      },
    }),
    prisma.item.findMany({
      select: {
        type: true,
        currentPrice: true,
        volume: true,
        totalSupply: true,
        priceChange24h: true,
        storeStatus: true,
      },
    }),
    prisma.item.findMany({
      where: { priceChange24h: { gt: 0 } },
      orderBy: { priceChange24h: "desc" },
      take: 10,
      select: {
        name: true,
        slug: true,
        imageUrl: true,
        type: true,
        currentPrice: true,
        priceChange24h: true,
        volume: true,
      },
    }),
    prisma.item.findMany({
      where: { priceChange24h: { lt: 0 } },
      orderBy: { priceChange24h: "asc" },
      take: 10,
      select: {
        name: true,
        slug: true,
        imageUrl: true,
        type: true,
        currentPrice: true,
        priceChange24h: true,
        volume: true,
      },
    }),
  ]);

  // Build typeBreakdown from price-having items only, computing both a true
  // avgPrice (mean of item prices) and a totalValue (sum of listing values).
  // Previously avgPrice was `totalValue / count` which was listings value per
  // item, not average item price.
  const typeBreakdown: TrendsData["typeBreakdown"] = {};
  const typePriceSums: Record<string, { sum: number; priced: number }> = {};
  for (const item of items) {
    const t = item.type || "unknown";
    if (!typeBreakdown[t]) typeBreakdown[t] = { count: 0, totalValue: 0, avgPrice: 0 };
    if (!typePriceSums[t]) typePriceSums[t] = { sum: 0, priced: 0 };
    typeBreakdown[t].count++;
    const price = item.currentPrice ?? 0;
    if (price > 0) {
      typePriceSums[t].sum += price;
      typePriceSums[t].priced++;
    }
    typeBreakdown[t].totalValue += price * (item.volume ?? 0);
  }
  for (const [t, entry] of Object.entries(typeBreakdown)) {
    const { sum, priced } = typePriceSums[t];
    entry.avgPrice = priced > 0 ? sum / priced : 0;
  }

  const storeStatusCounts = { available: 0, delisted: 0, unknown: 0 };
  for (const item of items) {
    const s = item.storeStatus as keyof typeof storeStatusCounts;
    if (s in storeStatusCounts) storeStatusCounts[s]++;
    else storeStatusCounts.unknown++;
  }

  const prices = items.map((i) => i.currentPrice ?? 0).filter((p) => p > 0);
  const sortedPrices = [...prices].sort((a, b) => a - b);

  // Estimated market cap: for items with known totalSupply, sum price * supply.
  // This is the real "market cap" concept; listingsValue is just active liquidity.
  const itemsWithSupply = items.filter(
    (i) => i.totalSupply != null && i.totalSupply > 0 && (i.currentPrice ?? 0) > 0,
  );
  const estMarketCap = itemsWithSupply.reduce(
    (sum, i) => sum + (i.currentPrice ?? 0) * (i.totalSupply ?? 0),
    0,
  );

  const currentStats = {
    totalItems: items.length,
    listingsValue: items.reduce(
      (sum, i) => sum + (i.currentPrice ?? 0) * (i.volume ?? 0),
      0,
    ),
    estMarketCap,
    estMarketCapItemCount: itemsWithSupply.length,
    avgPrice: prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : 0,
    medianPrice: median(prices) ?? 0,
    totalVolume: items.reduce((sum, i) => sum + (i.volume ?? 0), 0),
    totalSupply: items.reduce((sum, i) => sum + (i.totalSupply ?? 0), 0),
    floor: sortedPrices.length > 0 ? sortedPrices[0] : 0,
    ceiling: sortedPrices.length > 0 ? sortedPrices[sortedPrices.length - 1] : 0,
  };

  // 7-day movers — compute from PricePoint timeseries, NOT the stale
  // priceChange24h column. Uses a centered ±12h window around 7-days-ago
  // and picks the closest point per item for an accurate weekly baseline.
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const baselineStart = new Date(weekAgo.getTime() - 12 * 60 * 60 * 1000);
  const baselineEnd = new Date(weekAgo.getTime() + 12 * 60 * 60 * 1000);

  const [itemsWithImages, weekAgoPoints] = await Promise.all([
    prisma.item.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        imageUrl: true,
        type: true,
        currentPrice: true,
        volume: true,
      },
    }),
    prisma.pricePoint.findMany({
      where: { timestamp: { gte: baselineStart, lte: baselineEnd } },
      select: { itemId: true, price: true, timestamp: true },
    }),
  ]);

  const targetTime = weekAgo.getTime();
  const priceWeekAgo = new Map<string, number>();
  const bestDelta = new Map<string, number>();
  for (const p of weekAgoPoints) {
    const delta = Math.abs(p.timestamp.getTime() - targetTime);
    const prev = bestDelta.get(p.itemId);
    if (prev === undefined || delta < prev) {
      priceWeekAgo.set(p.itemId, p.price);
      bestDelta.set(p.itemId, delta);
    }
  }

  const weeklyMovers: WeeklyMover[] = itemsWithImages
    .map((i) => {
      const baseline = priceWeekAgo.get(i.id);
      const current = i.currentPrice ?? 0;
      if (!baseline || baseline <= 0 || current <= 0) return null;
      const weeklyChangePct = ((current - baseline) / baseline) * 100;
      return {
        name: i.name,
        slug: i.slug,
        imageUrl: i.imageUrl,
        type: i.type,
        currentPrice: i.currentPrice,
        volume: i.volume,
        weeklyChangePct,
        weekAgoPrice: baseline,
      };
    })
    .filter((x): x is WeeklyMover => x !== null);

  const topGainers7d = weeklyMovers
    .filter((m) => m.weeklyChangePct > 0)
    .sort((a, b) => b.weeklyChangePct - a.weeklyChangePct)
    .slice(0, 10);
  const topLosers7d = weeklyMovers
    .filter((m) => m.weeklyChangePct < 0)
    .sort((a, b) => a.weeklyChangePct - b.weeklyChangePct)
    .slice(0, 10);

  return {
    currentStats,
    snapshots,
    typeBreakdown,
    storeStatusCounts,
    topGainers,
    topLosers,
    topGainers7d,
    topLosers7d,
  };
}
