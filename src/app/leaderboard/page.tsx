import { Trophy } from "lucide-react";
import { prisma } from "@/lib/db";
import {
  LeaderboardTable,
  type LeaderboardRow,
} from "./_components/leaderboard-table";

// ISR — leaderboard data changes every sync (15-30 min). Caching the rendered
// HTML for 5 min keeps Googlebot fed without slamming the DB.
export const revalidate = 300;

// One value-sorted pool feeds every tab; the client re-sorts it per tab.
const POOL_SIZE = 50;
const SPARK_DAYS = 7;
const SPARK_MAX_POINTS = 24;

/** Evenly thin a series so the sparkline payload stays small per row. */
function downsample(values: number[], max = SPARK_MAX_POINTS): number[] {
  if (values.length <= max) return values;
  const out: number[] = [];
  const stride = (values.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) out.push(values[Math.round(i * stride)]);
  return out;
}

async function getLeaderboard(): Promise<LeaderboardRow[]> {
  // Top ~50 by value — the full "Most valuable" tab and the re-sort pool for
  // the other tabs (gainers / listed / rarest re-rank within this set).
  const items = await prisma.item.findMany({
    where: { currentPrice: { not: null, gt: 0 } },
    orderBy: { currentPrice: "desc" },
    take: POOL_SIZE,
    select: {
      id: true,
      name: true,
      slug: true,
      type: true,
      imageUrl: true,
      rarityColor: true,
      currentPrice: true,
      priceChange24h: true,
      totalSupply: true,
      supplyOnMarket: true,
      volume: true,
    },
  });

  // Pull the last 7d of price points for these items in one query and group
  // them into a per-item series for the inline 7d sparkline. Items without
  // enough history get an empty series (Sparkline reserves the slot).
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
    const arr = seriesByItem.get(p.itemId) ?? [];
    arr.push(p.price);
    seriesByItem.set(p.itemId, arr);
  }

  return items.map((it) => {
    const price = it.currentPrice;
    const supply = it.totalSupply;
    return {
      id: it.id,
      name: it.name,
      slug: it.slug,
      type: it.type,
      imageUrl: it.imageUrl,
      rarityColor: it.rarityColor,
      price,
      change24h: it.priceChange24h,
      supply,
      listings: it.supplyOnMarket ?? it.volume ?? 0,
      marketCap: price != null && supply != null ? price * supply : null,
      spark: downsample(seriesByItem.get(it.id) ?? []),
    };
  });
}

export default async function LeaderboardPage() {
  const rows = await getLeaderboard();

  return (
    <div className="mx-auto max-w-[1240px] px-6 pb-8 pt-9">
      {/* Header */}
      <div className="mb-[22px]">
        <h1 className="flex items-center gap-3 font-display text-[38px] font-extrabold tracking-[-0.02em] text-tx">
          <Trophy className="h-8 w-8 text-accent" strokeWidth={1.8} />
          Leaderboard
        </h1>
        <p className="mt-2 text-[14.5px] text-mut">
          The biggest, hottest, and rarest S&box skins on the market — ranked
          live.
        </p>
      </div>

      <LeaderboardTable rows={rows} />
    </div>
  );
}
