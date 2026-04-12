import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { cached, CACHE_TTL } from "@/lib/redis/cache";

/**
 * GET /api/trends?period=30d
 *
 * Returns market-wide analytics:
 * - Market snapshots over time (for charts)
 * - Current breakdown by type and rarity
 * - Top movers (gainers/losers)
 * - Store status summary
 */
export async function GET(request: NextRequest) {
  const period = request.nextUrl.searchParams.get("period") || "30d";

  const data = await cached(`trends:${period}`, CACHE_TTL.ITEMS_LIST, async () => {
    const now = new Date();
    const periodDays = period === "7d" ? 7 : period === "90d" ? 90 : period === "all" ? 365 : 30;
    const since = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);

    // Fetch all in parallel
    const [snapshots, items, topGainers, topLosers] = await Promise.all([
      // Market snapshots for charts
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

      // All items for breakdowns
      prisma.item.findMany({
        select: {
          type: true,
          rarity: true,
          currentPrice: true,
          volume: true,
          totalSupply: true,
          priceChange24h: true,
          storeStatus: true,
        },
      }),

      // Top gainers
      prisma.item.findMany({
        where: { priceChange24h: { gt: 0 } },
        orderBy: { priceChange24h: "desc" },
        take: 10,
        select: {
          name: true,
          slug: true,
          imageUrl: true,
          type: true,
          rarity: true,
          currentPrice: true,
          priceChange24h: true,
          volume: true,
        },
      }),

      // Top losers
      prisma.item.findMany({
        where: { priceChange24h: { lt: 0 } },
        orderBy: { priceChange24h: "asc" },
        take: 10,
        select: {
          name: true,
          slug: true,
          imageUrl: true,
          type: true,
          rarity: true,
          currentPrice: true,
          priceChange24h: true,
          volume: true,
        },
      }),
    ]);

    // Compute type breakdown
    const typeBreakdown: Record<string, { count: number; totalValue: number; avgPrice: number }> = {};
    const rarityBreakdown: Record<string, { count: number; totalValue: number; avgPrice: number }> = {};

    for (const item of items) {
      // Type
      const t = item.type || "unknown";
      if (!typeBreakdown[t]) typeBreakdown[t] = { count: 0, totalValue: 0, avgPrice: 0 };
      typeBreakdown[t].count++;
      typeBreakdown[t].totalValue += (item.currentPrice ?? 0) * (item.volume ?? 0);

      // Rarity
      const r = item.rarity || "unknown";
      if (!rarityBreakdown[r]) rarityBreakdown[r] = { count: 0, totalValue: 0, avgPrice: 0 };
      rarityBreakdown[r].count++;
      rarityBreakdown[r].totalValue += (item.currentPrice ?? 0) * (item.volume ?? 0);
    }

    // Compute avg prices
    for (const t of Object.values(typeBreakdown)) {
      t.avgPrice = t.count > 0 ? t.totalValue / t.count : 0;
    }
    for (const r of Object.values(rarityBreakdown)) {
      r.avgPrice = r.count > 0 ? r.totalValue / r.count : 0;
    }

    // Store status summary
    const storeStatusCounts = {
      available: 0,
      delisted: 0,
      unknown: 0,
    };
    for (const item of items) {
      const s = item.storeStatus as keyof typeof storeStatusCounts;
      if (s in storeStatusCounts) storeStatusCounts[s]++;
      else storeStatusCounts.unknown++;
    }

    // Current market stats
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
      rarityBreakdown,
      storeStatusCounts,
      topGainers,
      topLosers,
    };
  });

  return NextResponse.json(data);
}
