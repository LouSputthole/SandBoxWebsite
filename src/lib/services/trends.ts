import { prisma } from "@/lib/db";
import { median } from "@/lib/utils";

/**
 * Trends data fetcher — pulls market snapshots, item breakdowns, and top
 * movers in a single parallel batch. Used by both the /trends server-rendered
 * page and the /api/trends client API.
 */

export type TrendsPeriod = "live" | "24h" | "7d" | "30d" | "90d" | "all";

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
  switch (period) {
    case "live":
      return 0.25; // 6 hours, for the 10-min-cadence LIVE candles
    case "24h":
      return 1;
    case "7d":
      return 7;
    case "90d":
      return 90;
    case "all":
      return 365;
    case "30d":
    default:
      return 30;
  }
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
  // and takes the median of every point in the window. Same outlier-
  // resistant pattern we use in tweet/blog generators (PR #16): a single
  // bad scrape sample at the baseline edge can otherwise produce
  // +91000% movers when an item went $1.11 → $1011 because of one
  // anomalous mid-week reading.
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
      select: { itemId: true, price: true },
    }),
  ]);

  // Group all points per item, then take the median. Drop any zero/
  // negative prices first — those are scrape errors and corrupt the
  // median if included.
  const pointsByItem = new Map<string, number[]>();
  for (const p of weekAgoPoints) {
    if (p.price <= 0) continue;
    const arr = pointsByItem.get(p.itemId) ?? [];
    arr.push(p.price);
    pointsByItem.set(p.itemId, arr);
  }
  // Need at least 2 points in the window to trust the baseline. With
  // sync running every 15-30min, a 24h window normally contains
  // 48-96 points per item; a row with <2 means the item wasn't being
  // tracked yet (recent seed) and we shouldn't compute a 7d mover for
  // it at all.
  const priceWeekAgo = new Map<string, number>();
  for (const [itemId, prices] of pointsByItem) {
    if (prices.length < 2) continue;
    const m = median(prices);
    if (m != null && m > 0) priceWeekAgo.set(itemId, m);
  }

  // Hard sanity cap on % change. A real "we tracked this for a week"
  // move past 1000% is essentially always a scrape artifact (illiquid
  // item, exactly two clean syncs apart, one of them bogus). Excluding
  // them from the public top-gainers list keeps the tracker credible
  // without losing any signal — anything plausible falls under 1000%.
  const MAX_PLAUSIBLE_WEEKLY_PCT = 1000;

  const weeklyMovers: WeeklyMover[] = itemsWithImages
    .map((i) => {
      const baseline = priceWeekAgo.get(i.id);
      const current = i.currentPrice ?? 0;
      if (!baseline || baseline <= 0 || current <= 0) return null;
      const weeklyChangePct = ((current - baseline) / baseline) * 100;
      if (Math.abs(weeklyChangePct) > MAX_PLAUSIBLE_WEEKLY_PCT) return null;
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
