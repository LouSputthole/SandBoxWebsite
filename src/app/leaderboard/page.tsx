import { Trophy } from "lucide-react";
import { prisma } from "@/lib/db";
import {
  LeaderboardTable,
  type LeaderboardData,
  type LeaderboardRow,
} from "./_components/leaderboard-table";
import { DEFAULT_TAB, isValidTab } from "./_components/tabs";

// ISR — leaderboard data changes every sync (15-30 min). Caching the rendered
// HTML for 5 min keeps Googlebot fed without slamming the DB.
export const revalidate = 1800;

const DISPLAY_LIMIT = 25;
const SPARK_DAYS = 7;
const SPARK_MAX_POINTS = 24;

interface PageProps {
  searchParams: Promise<{ tab?: string }>;
}

// Every tab selects the same columns so they share one row mapper.
const ITEM_SELECT = {
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
} as const;

/** Evenly thin a series so the sparkline payload stays small per row. */
function downsample(values: number[], max = SPARK_MAX_POINTS): number[] {
  if (values.length <= max) return values;
  const out: number[] = [];
  const stride = (values.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) out.push(values[Math.round(i * stride)]);
  return out;
}

async function getLeaderboard(): Promise<LeaderboardData> {
  // One catalog-wide query per tab — each tab ranks the *whole* catalog by its
  // own metric (not a re-sort of a shared top-50 pool), so gainers/losers/
  // listed/rarest are accurate, not just the priciest items re-ordered.
  const [valuable, gainers, losers, listed, rarest] = await Promise.all([
    // Most valuable — highest current price.
    prisma.item.findMany({
      where: { currentPrice: { not: null, gt: 0 } },
      orderBy: { currentPrice: "desc" },
      take: DISPLAY_LIMIT,
      select: ITEM_SELECT,
    }),
    // Top gainers — biggest positive 24h move.
    prisma.item.findMany({
      where: { priceChange24h: { gt: 0 } },
      orderBy: { priceChange24h: "desc" },
      take: DISPLAY_LIMIT,
      select: ITEM_SELECT,
    }),
    // Top losers — biggest negative 24h move.
    prisma.item.findMany({
      where: { priceChange24h: { lt: 0 } },
      orderBy: { priceChange24h: "asc" },
      take: DISPLAY_LIMIT,
      select: ITEM_SELECT,
    }),
    // Most listed — most active market listings (supplyOnMarket, falling back
    // to volume for rows Steam hasn't given a live listing count).
    prisma.item.findMany({
      where: { OR: [{ supplyOnMarket: { gt: 0 } }, { volume: { gt: 0 } }] },
      orderBy: [
        { supplyOnMarket: { sort: "desc", nulls: "last" } },
        { volume: "desc" },
      ],
      take: DISPLAY_LIMIT,
      select: ITEM_SELECT,
    }),
    // Rarest — lowest known total supply (must have a real supply figure).
    prisma.item.findMany({
      where: { totalSupply: { not: null, gt: 0 } },
      orderBy: { totalSupply: "asc" },
      take: DISPLAY_LIMIT,
      select: ITEM_SELECT,
    }),
  ]);

  // Pull the last 7d of price points for every displayed item (union across
  // all tabs) in one query, grouped into a per-item series for the inline 7d
  // sparkline. Items without enough history get an empty series.
  const ids = Array.from(
    new Set(
      [valuable, gainers, losers, listed, rarest]
        .flat()
        .map((i) => i.id)
    )
  );
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

  const toRow = (it: (typeof valuable)[number]): LeaderboardRow => {
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
  };

  return {
    valuable: valuable.map(toRow),
    gainers: gainers.map(toRow),
    losers: losers.map(toRow),
    listed: listed.map(toRow),
    rarest: rarest.map(toRow),
  };
}

export default async function LeaderboardPage({ searchParams }: PageProps) {
  const { tab: rawTab } = await searchParams;
  const initialTab = isValidTab(rawTab) ? rawTab : DEFAULT_TAB;
  const lists = await getLeaderboard();

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

      <LeaderboardTable lists={lists} initialTab={initialTab} />
    </div>
  );
}
