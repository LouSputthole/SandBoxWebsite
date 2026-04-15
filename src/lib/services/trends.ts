import { prisma } from "@/lib/db";

/**
 * Trends data fetcher — pulls market snapshots, item breakdowns, and top
 * movers in a single parallel batch. Used by both the /trends server-rendered
 * page and the /api/trends client API.
 */

export type TrendsPeriod = "7d" | "30d" | "90d" | "all";

export interface TrendsData {
  currentStats: {
    totalItems: number;
    marketCap: number;
    avgPrice: number;
    medianPrice: number;
    totalVolume: number;
    totalSupply: number;
    floor: number;
    ceiling: number;
  };
  snapshots: {
    timestamp: Date;
    marketCap: number;
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
        marketCap: true,
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

  const typeBreakdown: TrendsData["typeBreakdown"] = {};
  for (const item of items) {
    const t = item.type || "unknown";
    if (!typeBreakdown[t]) typeBreakdown[t] = { count: 0, totalValue: 0, avgPrice: 0 };
    typeBreakdown[t].count++;
    typeBreakdown[t].totalValue += (item.currentPrice ?? 0) * (item.volume ?? 0);
  }
  for (const t of Object.values(typeBreakdown)) {
    t.avgPrice = t.count > 0 ? t.totalValue / t.count : 0;
  }

  const storeStatusCounts = { available: 0, delisted: 0, unknown: 0 };
  for (const item of items) {
    const s = item.storeStatus as keyof typeof storeStatusCounts;
    if (s in storeStatusCounts) storeStatusCounts[s]++;
    else storeStatusCounts.unknown++;
  }

  const prices = items.map((i) => i.currentPrice ?? 0).filter((p) => p > 0);
  const sortedPrices = [...prices].sort((a, b) => a - b);
  const median = sortedPrices.length > 0
    ? sortedPrices[Math.floor(sortedPrices.length / 2)]
    : 0;

  const currentStats = {
    totalItems: items.length,
    marketCap: items.reduce((sum, i) => sum + (i.currentPrice ?? 0) * (i.volume ?? 0), 0),
    avgPrice: prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : 0,
    medianPrice: median,
    totalVolume: items.reduce((sum, i) => sum + (i.volume ?? 0), 0),
    totalSupply: items.reduce((sum, i) => sum + (i.totalSupply ?? 0), 0),
    floor: sortedPrices.length > 0 ? sortedPrices[0] : 0,
    ceiling: sortedPrices.length > 0 ? sortedPrices[sortedPrices.length - 1] : 0,
  };

  return {
    currentStats,
    snapshots,
    typeBreakdown,
    storeStatusCounts,
    topGainers,
    topLosers,
  };
}
