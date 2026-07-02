import { getTrendsData, type TrendsPeriod } from "@/lib/services/trends";
import type { Period, RawSnapshot } from "@/lib/trends/candles";
import {
  TrendsView,
  type KpiVM,
  type CategoryVM,
  type TypeCountVM,
  type MoverVM,
  type SecondaryStatsVM,
} from "./_components/trends-view";

// ISR — regenerate every 5 minutes so search engines get cached HTML.
// `searchParams` keeps each ?period= window cached independently.
export const revalidate = 1800;

const CATEGORY_META: Record<string, { label: string; color: string }> = {
  accessory: { label: "Accessories", color: "var(--cat-accessory)" },
  clothing: { label: "Clothing", color: "var(--cat-clothing)" },
  character: { label: "Characters", color: "var(--cat-character)" },
  weapon: { label: "Weapons", color: "var(--cat-weapon)" },
  tool: { label: "Tools", color: "var(--cat-tool)" },
  unknown: { label: "Other", color: "var(--faint)" },
};

const VALID_PERIODS: TrendsPeriod[] = ["live", "24h", "7d", "30d", "90d", "all"];

const PERIOD_TO_CANDLE: Record<TrendsPeriod, Period> = {
  live: "LIVE",
  "24h": "24H",
  "7d": "7D",
  "30d": "30D",
  "90d": "90D",
  all: "ALL",
};

function isValidPeriod(p: string | undefined): p is TrendsPeriod {
  return p !== undefined && (VALID_PERIODS as string[]).includes(p);
}

/**
 * Drop leading non-positive values. estMarketCap was added after launch, so
 * early MarketSnapshots store NULL (→ 0 here) and would otherwise draw a false
 * jump from $0 up to the first real value. Applied per metric for the KPIs.
 */
function trimLeading(vals: number[]): number[] {
  const i = vals.findIndex((v) => v > 0);
  return i <= 0 ? vals : vals.slice(i);
}

/** Thin a series to at most `cap` points (keeps the last) to bound payload. */
function downsample<T>(arr: T[], cap: number): T[] {
  if (arr.length <= cap) return arr;
  const step = arr.length / cap;
  const out: T[] = [];
  for (let i = 0; i < cap; i++) out.push(arr[Math.floor(i * step)]);
  const last = arr[arr.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

/** First→last percent change of a series, as an unsigned label + direction. */
function kpiDelta(vals: number[]): { delta?: string; deltaPositive?: boolean } {
  if (vals.length < 2) return {};
  const first = vals[0];
  const last = vals[vals.length - 1];
  if (!(first > 0)) return {};
  const pct = ((last - first) / first) * 100;
  return { delta: `${Math.abs(pct).toFixed(1)}%`, deltaPositive: pct >= 0 };
}

interface RawMover {
  name: string;
  slug: string;
  imageUrl: string | null;
  type: string;
  currentPrice: number | null;
  priceChange24h: number | null;
  rarityColor: string | null;
}

function toMover(m: RawMover): MoverVM {
  return {
    name: m.name,
    slug: m.slug,
    imageUrl: m.imageUrl,
    type: m.type,
    price: m.currentPrice,
    change: m.priceChange24h ?? 0,
    rarityColor: m.rarityColor,
  };
}

interface RawWeeklyMover {
  name: string;
  slug: string;
  imageUrl: string | null;
  type: string;
  currentPrice: number | null;
  weeklyChangePct: number;
  weekAgoPrice: number;
}

function toWeeklyMover(m: RawWeeklyMover): MoverVM {
  return {
    name: m.name,
    slug: m.slug,
    imageUrl: m.imageUrl,
    type: m.type,
    price: m.currentPrice,
    change: m.weeklyChangePct,
    rarityColor: null,
    // Pass the week-ago baseline as a raw USD number; the client row renders
    // it through <Price> so the "from → to" line follows the user's currency.
    baselineUsd: m.weekAgoPrice,
  };
}

interface PageProps {
  searchParams: Promise<{ period?: string }>;
}

export default async function TrendsPage({ searchParams }: PageProps) {
  const { period: rawPeriod } = await searchParams;
  const period: TrendsPeriod = isValidPeriod(rawPeriod) ? rawPeriod : "30d";

  const data = await getTrendsData(period);
  const s = data.currentStats;
  const snaps = data.snapshots;

  // Per-metric historical series for the KPI sparklines + deltas (this window).
  const mcVals = trimLeading(snaps.map((x) => x.estMarketCap ?? 0));
  const avgVals = trimLeading(snaps.map((x) => x.avgPrice));
  const listVals = trimLeading(snaps.map((x) => x.totalVolume));
  const liqVals = trimLeading(snaps.map((x) => x.listingsValue));

  const kpis: KpiVM[] = [
    {
      label: "Total market cap",
      format: "compact",
      value: s.estMarketCap,
      ...kpiDelta(mcVals),
      spark: downsample(mcVals, 24),
    },
    {
      label: "Average price",
      format: "price",
      value: s.avgPrice,
      ...kpiDelta(avgVals),
      spark: downsample(avgVals, 24),
    },
    {
      label: "Active listings",
      format: "number",
      value: s.totalVolume,
      ...kpiDelta(listVals),
      spark: downsample(listVals, 24),
    },
    {
      label: "Listings value",
      format: "compact",
      value: s.listingsValue,
      ...kpiDelta(liqVals),
      spark: downsample(liqVals, 24),
    },
  ];

  const stats: SecondaryStatsVM = {
    medianPrice: s.medianPrice,
    totalItems: s.totalItems,
    totalSupply: s.totalSupply,
    floor: s.floor,
    ceiling: s.ceiling,
    estMarketCapItemCount: s.estMarketCapItemCount,
  };

  const metricCurrent = {
    estMarketCap: s.estMarketCap,
    listingsValue: s.listingsValue,
    avgPrice: s.avgPrice,
    totalVolume: s.totalVolume,
  };

  // Raw snapshot series for the chart (ISO timestamps, 4 metric fields).
  // Capped so the client payload stays light on the wide windows; bucketize
  // still aggregates these into OHLC candles, and the area view downsamples
  // further client-side.
  const snapshots: RawSnapshot[] = downsample(
    snaps.map((x) => ({
      timestamp: x.timestamp.toISOString(),
      estMarketCap: x.estMarketCap,
      listingsValue: x.listingsValue,
      avgPrice: x.avgPrice,
      totalVolume: x.totalVolume,
    })),
    2000,
  );

  // Category breakdown → each type's share of total listings value (bars).
  const totalCat = Object.values(data.typeBreakdown).reduce(
    (a, b) => a + b.totalValue,
    0,
  );
  const categories: CategoryVM[] = Object.entries(data.typeBreakdown)
    .map(([type, v]) => {
      const meta = CATEGORY_META[type] ?? CATEGORY_META.unknown;
      return {
        type,
        label: meta.label,
        color: meta.color,
        value: v.totalValue,
        pct: totalCat > 0 ? (v.totalValue / totalCat) * 100 : 0,
      };
    })
    .filter((c) => c.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  // Item count by type → the donut.
  const typeCounts: TypeCountVM[] = Object.entries(data.typeBreakdown)
    .map(([type, v]) => {
      const meta = CATEGORY_META[type] ?? CATEGORY_META.unknown;
      return { type, label: meta.label, color: meta.color, count: v.count };
    })
    .filter((t) => t.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  return (
    <TrendsView
      period={period}
      candlePeriod={PERIOD_TO_CANDLE[period]}
      kpis={kpis}
      stats={stats}
      metricCurrent={metricCurrent}
      snapshots={snapshots}
      categories={categories}
      typeCounts={typeCounts}
      gainers={data.topGainers.slice(0, 8).map(toMover)}
      losers={data.topLosers.slice(0, 8).map(toMover)}
      gainers7d={data.topGainers7d.slice(0, 8).map(toWeeklyMover)}
      losers7d={data.topLosers7d.slice(0, 8).map(toWeeklyMover)}
    />
  );
}
