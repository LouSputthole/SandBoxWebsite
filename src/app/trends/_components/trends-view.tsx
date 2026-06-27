"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  TrendingUp,
  TrendingDown,
  CandlestickChart,
  AreaChart as AreaIcon,
  type LucideIcon,
} from "lucide-react";
import {
  AreaChart,
  CandleChart,
  DonutChart,
  type AreaPoint,
} from "@/components/charts";
import { StatCard } from "@/components/data";
import { SkinTile } from "@/components/items/skin-tile";
import { Price } from "@/components/ui/price";
import { cn, formatPrice, formatPriceChange } from "@/lib/utils";
import { rarityCssColor } from "@/lib/rarity";
import {
  bucketize,
  type CandleMetric,
  type Period,
  type RawSnapshot,
} from "@/lib/trends/candles";
import type { TrendsPeriod } from "@/lib/services/trends";

/**
 * Arcade "Market trends" board. The whole thing below the nav is one client
 * subtree so the chart's metric switcher + Area/Candle view toggle run on
 * local state. The period window (Live / 24H / 7D / 30D / 90D / All) is
 * URL-driven (`?period=`) and server-rendered: each chip is a <Link> that
 * reloads the page with a fresh data window, so the candle bucket size and
 * the date axis always match the selected timeframe.
 *
 * KPI headline figures, the secondary stats, the category breakdowns, and the
 * mover lists are period-independent (computed from the live catalog on the
 * server); only the snapshot-derived chart + KPI sparklines follow the window.
 * Numbers render in JetBrains Mono; up/down green/red is reserved for price
 * signals (deltas, candles, mover changes).
 */

const PERIODS: { value: TrendsPeriod; label: string }[] = [
  { value: "live", label: "Live" },
  { value: "24h", label: "24H" },
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "90d", label: "90D" },
  { value: "all", label: "All" },
];

const METRICS: CandleMetric[] = [
  "estMarketCap",
  "listingsValue",
  "avgPrice",
  "totalVolume",
];

const METRIC_META: Record<
  CandleMetric,
  { chip: string; title: string; color: string; isPrice: boolean }
> = {
  estMarketCap: {
    chip: "Est. Mkt Cap",
    title: "Estimated market cap",
    color: "var(--accent)",
    isPrice: true,
  },
  listingsValue: {
    chip: "Listings $",
    title: "Listings value",
    color: "var(--accent2)",
    isPrice: true,
  },
  avgPrice: {
    chip: "Avg Price",
    title: "Average price",
    color: "var(--cat-character)",
    isPrice: true,
  },
  totalVolume: {
    chip: "Volume",
    title: "Active listings volume",
    color: "var(--cat-accessory)",
    isPrice: false,
  },
};

const CANDLE_INTERVAL: Record<Period, string> = {
  LIVE: "10m candles",
  "24H": "30m candles",
  "7D": "1h candles",
  "30D": "4h candles",
  "90D": "1d candles",
  ALL: "3d candles",
};

export interface KpiVM {
  label: string;
  format: "compact" | "price" | "number";
  value: number;
  delta?: string;
  deltaPositive?: boolean;
  spark: number[];
}

export interface SecondaryStatsVM {
  medianPrice: number;
  totalItems: number;
  totalSupply: number;
  floor: number;
  ceiling: number;
  estMarketCapItemCount: number;
}

export interface CategoryVM {
  type: string;
  label: string;
  /** CSS color (e.g. var(--cat-clothing)). */
  color: string;
  value: number;
  /** 0–100 share of total category value. */
  pct: number;
}

export interface TypeCountVM {
  type: string;
  label: string;
  color: string;
  count: number;
}

export interface MoverVM {
  name: string;
  slug: string;
  imageUrl: string | null;
  type: string;
  price: number | null;
  /** Percent change (24h for movers, weekly for 7-day). */
  change: number;
  /** Steam-sourced rarity tint (hex, no leading #), when graded. */
  rarityColor?: string | null;
  /** Optional secondary line (e.g. "$1.20 → $1.80" for weekly movers). */
  sub?: string;
}

interface TrendsViewProps {
  period: TrendsPeriod;
  candlePeriod: Period;
  kpis: KpiVM[];
  stats: SecondaryStatsVM;
  /** Current value per chart metric (period-independent, from live catalog). */
  metricCurrent: Record<CandleMetric, number>;
  /** Raw snapshot series for the selected window (timestamps as ISO strings). */
  snapshots: RawSnapshot[];
  categories: CategoryVM[];
  typeCounts: TypeCountVM[];
  gainers: MoverVM[];
  losers: MoverVM[];
  gainers7d: MoverVM[];
  losers7d: MoverVM[];
}

/** Abbreviated USD for big aggregates ($1.78M / $48.2K). */
function formatCompactUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

/** Abbreviated count (12.3K / 3.4M) for the volume axis + tooltip. */
function formatCompactNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return Math.round(n).toLocaleString();
}

function kpiValueNode(k: KpiVM) {
  if (k.format === "price") return <Price amount={k.value} />;
  if (k.format === "number") return k.value.toLocaleString();
  return formatCompactUsd(k.value);
}

/** Thin a series to at most `cap` points (keeps endpoints) for light render. */
function downsample<T>(arr: T[], cap: number): T[] {
  if (arr.length <= cap) return arr;
  const step = arr.length / cap;
  const out: T[] = [];
  for (let i = 0; i < cap; i++) out.push(arr[Math.floor(i * step)]);
  const last = arr[arr.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

function metricValue(s: RawSnapshot, metric: CandleMetric): number {
  if (metric === "estMarketCap") return s.estMarketCap ?? 0;
  return s[metric];
}

/** Axis/tooltip value formatter for a metric (USD-base, compact, string out).
 *  Compact so the Y-axis ticks + OHLC tooltip don't blow out their width. */
function metricFormatter(metric: CandleMetric): (v: number) => string {
  if (metric === "avgPrice") return (v) => formatPrice(v); // small, full precision
  if (metric === "totalVolume") return (v) => formatCompactNum(v);
  return (v) => formatCompactUsd(v); // estMarketCap, listingsValue
}

/** Period-aware X-axis label so the date granularity matches the window. */
function makeDateLabel(period: Period): (t: string | number) => string {
  return (t) => {
    const d = new Date(t);
    if (period === "LIVE" || period === "24H")
      return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    if (period === "7D")
      return d.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
      });
    if (period === "ALL")
      return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };
}

export function TrendsView({
  period,
  candlePeriod,
  kpis,
  stats,
  metricCurrent,
  snapshots,
  categories,
  typeCounts,
  gainers,
  losers,
  gainers7d,
  losers7d,
}: TrendsViewProps) {
  return (
    <div className="mx-auto max-w-[1240px] px-6 pb-12 pt-8">
      {/* Header + period switcher */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-5">
        <div className="min-w-0">
          <h1 className="m-0 font-display text-[38px] font-extrabold leading-none tracking-[-.02em] text-tx">
            Market trends
          </h1>
          <p className="mt-2 text-[14.5px] text-mut">
            How the whole S&amp;box cosmetics economy is moving — recalculated
            on every sync.
          </p>
        </div>
        <PeriodSwitcher period={period} />
      </div>

      {/* KPI cards with mini sparklines */}
      <div className="mb-[18px] grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map((k) => (
          <StatCard
            key={k.label}
            label={k.label}
            value={kpiValueNode(k)}
            delta={k.delta}
            deltaPositive={k.deltaPositive}
            spark={k.spark}
          />
        ))}
      </div>

      {/* Secondary stat strip */}
      <div className="mb-[18px] grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        <MiniStat label="Median price" value={<Price amount={stats.medianPrice} />} />
        <MiniStat label="Tracked items" value={stats.totalItems.toLocaleString()} />
        <MiniStat label="Total supply" value={stats.totalSupply.toLocaleString()} />
        <MiniStat
          label="Price range"
          value={
            <span className="whitespace-nowrap">
              <Price amount={stats.floor} /> – <Price amount={stats.ceiling} />
            </span>
          }
        />
        <MiniStat
          label="Supply coverage"
          value={`${stats.estMarketCapItemCount.toLocaleString()} / ${stats.totalItems.toLocaleString()}`}
          hint="items w/ known supply"
        />
      </div>

      {/* Main chart — metric switcher + Area/Candle toggle */}
      <ChartSection
        snapshots={snapshots}
        candlePeriod={candlePeriod}
        metricCurrent={metricCurrent}
      />

      {/* Composition — value share (bars) + item count by type (donut) */}
      <div className="mt-[18px] grid grid-cols-1 gap-[18px] lg:grid-cols-2">
        <CategoryCard categories={categories} />
        <TypeDonutCard typeCounts={typeCounts} />
      </div>

      {/* 24h movers */}
      <div className="mt-[18px] grid grid-cols-1 gap-[18px] lg:grid-cols-2">
        <MoverPanel
          title="Top gainers (24h)"
          color="var(--up)"
          Icon={TrendingUp}
          items={gainers}
        />
        <MoverPanel
          title="Top losers (24h)"
          color="var(--down)"
          Icon={TrendingDown}
          items={losers}
        />
      </div>

      {/* 7-day movers */}
      <div className="mt-[18px] grid grid-cols-1 gap-[18px] lg:grid-cols-2">
        <MoverPanel
          title="Top gainers (7d)"
          color="var(--up)"
          Icon={TrendingUp}
          items={gainers7d}
          emptyText="Not enough 7-day price history yet."
        />
        <MoverPanel
          title="Top losers (7d)"
          color="var(--down)"
          Icon={TrendingDown}
          items={losers7d}
          emptyText="Not enough 7-day price history yet."
        />
      </div>
    </div>
  );
}

function PeriodSwitcher({ period }: { period: TrendsPeriod }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {PERIODS.map((p) => {
        const active = p.value === period;
        return (
          <Link
            key={p.value}
            href={`/trends?period=${p.value}`}
            scroll={false}
            replace
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-[9px] border px-3 py-1.5 font-mono text-[12px] font-bold transition-colors",
              active
                ? "border-accent bg-accent text-white"
                : "border-line bg-transparent text-mut hover:text-tx",
            )}
          >
            {p.label}
          </Link>
        );
      })}
    </div>
  );
}

function MiniStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
}) {
  return (
    <div className="rounded-[18px] border border-line bg-panel p-[18px]">
      <div className="mb-2 font-mono text-[11px] uppercase tracking-[.5px] text-faint">
        {label}
      </div>
      <div className="font-mono text-[18px] font-bold leading-none tracking-[-.5px] text-tx">
        {value}
      </div>
      {hint && <div className="mt-1.5 text-[11px] text-faint">{hint}</div>}
    </div>
  );
}

type ViewMode = "area" | "candles";

function ChartSection({
  snapshots,
  candlePeriod,
  metricCurrent,
}: {
  snapshots: RawSnapshot[];
  candlePeriod: Period;
  metricCurrent: Record<CandleMetric, number>;
}) {
  const hasEstCap = useMemo(
    () => snapshots.some((s) => (s.estMarketCap ?? 0) > 0),
    [snapshots],
  );
  const [metric, setMetric] = useState<CandleMetric>(
    hasEstCap ? "estMarketCap" : "listingsValue",
  );
  const [view, setView] = useState<ViewMode>("area");

  const meta = METRIC_META[metric];
  const fmt = useMemo(() => metricFormatter(metric), [metric]);
  const labelFormatter = useMemo(
    () => makeDateLabel(candlePeriod),
    [candlePeriod],
  );

  // Area series for the active metric: trim leading zeros (early snapshots
  // predate estMarketCap → NULL → 0, which would draw a false jump from $0),
  // then downsample for a light render. Endpoints are preserved.
  const areaSeries = useMemo<AreaPoint[]>(() => {
    const series = snapshots.map((s) => ({
      t: new Date(s.timestamp).getTime(),
      v: metricValue(s, metric),
    }));
    const i = series.findIndex((p) => p.v > 0);
    const trimmed = i <= 0 ? series : series.slice(i);
    return downsample(trimmed, 400);
  }, [snapshots, metric]);

  const candleData = useMemo(
    () => bucketize(snapshots, metric, candlePeriod),
    [snapshots, metric, candlePeriod],
  );

  // Headline figure = live current value; delta = first→last of the window.
  const { delta, deltaPositive } = useMemo(() => {
    if (areaSeries.length < 2) return { delta: undefined, deltaPositive: true };
    const first = areaSeries[0].v;
    const last = areaSeries[areaSeries.length - 1].v;
    if (!(first > 0)) return { delta: undefined, deltaPositive: true };
    const pct = ((last - first) / first) * 100;
    const positive = pct >= 0;
    return {
      delta: `${positive ? "▲ +" : "▼ −"}${Math.abs(pct).toFixed(1)}%`,
      deltaPositive: positive,
    };
  }, [areaSeries]);

  const headline = meta.isPrice ? (
    <Price amount={metricCurrent[metric]} />
  ) : (
    metricCurrent[metric].toLocaleString()
  );

  const empty =
    view === "candles" ? candleData.length === 0 : areaSeries.length < 2;

  return (
    <section className="rounded-[18px] border border-line bg-panel p-[22px]">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="m-0 font-display text-[18px] font-bold text-tx">
            {meta.title}
          </h2>
          <div className="mt-2 flex items-baseline gap-2.5">
            <span className="font-mono text-[28px] font-bold leading-none tracking-[-1px] text-tx">
              {headline}
            </span>
            {delta && (
              <span
                className="font-mono text-[13px] font-bold"
                style={{ color: deltaPositive ? "var(--up)" : "var(--down)" }}
              >
                {delta}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-start gap-2.5 sm:items-end">
          <MetricChips active={metric} onChange={setMetric} />
          <div className="flex items-center gap-3">
            <ViewToggle view={view} onChange={setView} />
            {view === "candles" && (
              <span className="font-mono text-[10px] uppercase tracking-[.5px] text-faint">
                {CANDLE_INTERVAL[candlePeriod]}
              </span>
            )}
          </div>
        </div>
      </div>

      {empty ? (
        <div className="flex h-[320px] items-center justify-center text-center text-sm text-faint">
          No historical data yet. Snapshots are captured each sync cycle.
        </div>
      ) : view === "candles" ? (
        <CandleChart data={candleData} height={320} valueFormatter={fmt} />
      ) : (
        <AreaChart
          series={areaSeries}
          color={meta.color}
          height={320}
          xAxis
          yAxis
          valueFormatter={fmt}
          labelFormatter={labelFormatter}
        />
      )}
    </section>
  );
}

function MetricChips({
  active,
  onChange,
}: {
  active: CandleMetric;
  onChange: (m: CandleMetric) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {METRICS.map((m) => {
        const on = m === active;
        return (
          <button
            key={m}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(m)}
            className={cn(
              "rounded-[9px] border px-2.5 py-1.5 font-mono text-[12px] font-bold transition-colors",
              on
                ? "border-accent bg-accent text-white"
                : "border-line bg-transparent text-mut hover:text-tx",
            )}
          >
            {METRIC_META[m].chip}
          </button>
        );
      })}
    </div>
  );
}

function ViewToggle({
  view,
  onChange,
}: {
  view: ViewMode;
  onChange: (v: ViewMode) => void;
}) {
  const opts: { key: ViewMode; label: string; Icon: LucideIcon }[] = [
    { key: "area", label: "Area", Icon: AreaIcon },
    { key: "candles", label: "Candles", Icon: CandlestickChart },
  ];
  return (
    <div className="inline-flex items-center gap-1 rounded-[10px] border border-line bg-bg2 p-1">
      {opts.map(({ key, label, Icon }) => {
        const on = key === view;
        return (
          <button
            key={key}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(key)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-[7px] px-2.5 py-1 font-mono text-[12px] font-bold transition-colors",
              on
                ? "bg-panel text-tx shadow-[0_1px_2px_rgba(0,0,0,.4)]"
                : "text-mut hover:text-tx",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        );
      })}
    </div>
  );
}

function CategoryCard({ categories }: { categories: CategoryVM[] }) {
  return (
    <div className="rounded-[18px] border border-line bg-panel p-[22px]">
      <h2 className="m-0 mb-1 font-display text-[18px] font-bold text-tx">
        Market value by category
      </h2>
      <p className="mb-[18px] text-[12.5px] text-faint">
        Where the listings value sits across the catalog.
      </p>
      {categories.length === 0 ? (
        <p className="py-4 text-center text-xs text-faint">
          No category data yet.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {categories.map((c) => (
            <div key={c.type}>
              <div className="mb-[7px] flex items-center justify-between">
                <span className="flex items-center gap-2 text-[13.5px] font-semibold text-tx">
                  <span
                    className="h-2.5 w-2.5 rounded-[3px]"
                    style={{ background: c.color }}
                  />
                  {c.label}
                </span>
                <span className="font-mono text-[12.5px] text-mut">
                  {formatCompactUsd(c.value)}
                </span>
              </div>
              <div className="h-[9px] overflow-hidden rounded-[5px] bg-bg2">
                <div
                  className="h-full rounded-[5px]"
                  style={{
                    width: `${Math.max(c.pct, 1.5)}%`,
                    background: c.color,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TypeDonutCard({ typeCounts }: { typeCounts: TypeCountVM[] }) {
  const total = typeCounts.reduce((sum, t) => sum + t.count, 0);
  return (
    <div className="rounded-[18px] border border-line bg-panel p-[22px]">
      <h2 className="m-0 mb-1 font-display text-[18px] font-bold text-tx">
        Items by type
      </h2>
      <p className="mb-[18px] text-[12.5px] text-faint">
        How many tracked skins sit in each category.
      </p>
      {typeCounts.length === 0 ? (
        <p className="py-4 text-center text-xs text-faint">No type data yet.</p>
      ) : (
        <div className="flex items-center gap-5">
          <div className="h-[150px] w-[150px] shrink-0">
            <DonutChart
              data={typeCounts.map((t) => ({
                name: t.type,
                label: t.label,
                value: t.count,
                color: t.color,
              }))}
              height={150}
              valueFormatter={(v) => `${v.toLocaleString()} items`}
            />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            {typeCounts.map((t) => (
              <div
                key={t.type}
                className="flex items-center justify-between gap-2 text-[13px]"
              >
                <span className="flex items-center gap-2 font-semibold text-tx">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ background: t.color }}
                  />
                  {t.label}
                </span>
                <span className="font-mono text-[12.5px] text-mut">
                  {t.count.toLocaleString()}
                  <span className="ml-1 text-faint">
                    {total > 0 ? `${Math.round((t.count / total) * 100)}%` : ""}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MoverPanel({
  title,
  color,
  Icon,
  items,
  emptyText = "No movers right now.",
}: {
  title: string;
  color: string;
  Icon: LucideIcon;
  items: MoverVM[];
  emptyText?: string;
}) {
  return (
    <div className="rounded-[18px] border border-line bg-panel p-[18px]">
      <div className="mb-3 flex items-center gap-2.5">
        <span
          className="inline-flex h-7 w-7 items-center justify-center rounded-[8px]"
          style={{
            background: `color-mix(in srgb, ${color} 16%, transparent)`,
            color,
          }}
        >
          <Icon className="h-4 w-4" />
        </span>
        <h3 className="m-0 font-display text-[16px] font-bold" style={{ color }}>
          {title}
        </h3>
      </div>
      {items.length === 0 ? (
        <p className="py-4 text-center text-xs text-faint">{emptyText}</p>
      ) : (
        <div>
          {items.map((it) => (
            <MoverRow key={it.slug} item={it} color={color} />
          ))}
        </div>
      )}
    </div>
  );
}

function MoverRow({ item, color }: { item: MoverVM; color: string }) {
  return (
    <Link
      href={`/items/${item.slug}`}
      className="flex items-center gap-3 rounded-[11px] p-2 transition-colors hover:bg-bg2"
    >
      <SkinTile
        imageUrl={item.imageUrl}
        name={item.name}
        type={item.type}
        rarityColor={rarityCssColor(item.rarityColor)}
        className="h-[38px] w-[38px] shrink-0 !rounded-[10px]"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold text-tx">
          {item.name}
        </span>
        {item.sub ? (
          <span className="block truncate font-mono text-[11.5px] text-faint">
            {item.sub}
          </span>
        ) : (
          <span className="block truncate text-[11.5px] capitalize text-faint">
            {item.type}
          </span>
        )}
      </span>
      <span className="shrink-0 text-right">
        <span className="block font-mono text-[13.5px] font-bold text-tx">
          {item.price != null ? <Price amount={item.price} /> : "—"}
        </span>
        <span className="font-mono text-[12px] font-bold" style={{ color }}>
          {formatPriceChange(item.change)}
        </span>
      </span>
    </Link>
  );
}
