import { getTrendsData } from "@/lib/services/trends";
import {
  TrendsView,
  type KpiVM,
  type CategoryVM,
  type MoverVM,
  type MarketCapPoint,
} from "./_components/trends-view";

// ISR — regenerate every 5 minutes so search engines get cached HTML.
export const revalidate = 300;

const CATEGORY_META: Record<string, { label: string; color: string }> = {
  accessory: { label: "Accessories", color: "var(--cat-accessory)" },
  clothing: { label: "Clothing", color: "var(--cat-clothing)" },
  character: { label: "Characters", color: "var(--cat-character)" },
  weapon: { label: "Weapons", color: "var(--cat-weapon)" },
  tool: { label: "Tools", color: "var(--cat-tool)" },
  unknown: { label: "Other", color: "var(--faint)" },
};

/**
 * Drop leading non-positive values. estMarketCap was added after launch, so
 * early MarketSnapshots store NULL (→ 0 here) and would otherwise draw a false
 * jump from $0 up to the first real value. Mirrors the existing chart-section
 * trimming, applied per metric.
 */
function trimLeading(vals: number[]): number[] {
  const i = vals.findIndex((v) => v > 0);
  return i <= 0 ? vals : vals.slice(i);
}

/** Thin a series to at most `cap` points (keeps the last) so the client
 *  payload + chart render stay light over a 90-day window. */
function downsample<T>(arr: T[], cap: number): T[] {
  if (arr.length <= cap) return arr;
  const step = arr.length / cap;
  const out: T[] = [];
  for (let i = 0; i < cap; i++) out.push(arr[Math.floor(i * step)]);
  const last = arr[arr.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

/** First→last percent change of a series, as an unsigned label + direction.
 *  StatCard prepends its own ▲/▼ arrow. */
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

export default async function TrendsPage() {
  // Load a 90-day window so the client 7D/30D/90D toggle can slice the
  // market-cap series without a server round-trip. currentStats, movers, and
  // the category breakdown are period-independent.
  const data = await getTrendsData("90d");
  const s = data.currentStats;
  const snaps = data.snapshots;

  // Per-metric historical series for the KPI sparklines + deltas.
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

  // Market-cap area series (epoch ms + value), trimmed + downsampled.
  const mcSeriesFull: MarketCapPoint[] = snaps.map((x) => ({
    t: new Date(x.timestamp).getTime(),
    v: x.estMarketCap ?? 0,
  }));
  const firstReal = mcSeriesFull.findIndex((p) => p.v > 0);
  const mcTrimmed =
    firstReal <= 0 ? mcSeriesFull : mcSeriesFull.slice(firstReal);
  const marketCapSeries = downsample(mcTrimmed, 360);

  // Category breakdown → each type's share of total listings value.
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

  return (
    <TrendsView
      kpis={kpis}
      marketCap={{ current: s.estMarketCap, series: marketCapSeries }}
      categories={categories}
      gainers={data.topGainers.slice(0, 5).map(toMover)}
      losers={data.topLosers.slice(0, 5).map(toMover)}
    />
  );
}
