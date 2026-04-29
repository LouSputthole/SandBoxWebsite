"use client";

import { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { CandlestickChart, AreaChart as AreaIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/utils";
import { bucketize, type Period, type CandleMetric } from "@/lib/trends/candles";

const MarketAreaChart = dynamic(
  () => import("@/components/trends/market-area-chart"),
  {
    ssr: false,
    loading: () => (
      <div className="h-full w-full flex items-center justify-center text-xs text-neutral-600">
        Loading chart...
      </div>
    ),
  },
);

const MarketCandleChart = dynamic(
  () => import("@/components/trends/market-candle-chart"),
  {
    ssr: false,
    loading: () => (
      <div className="h-full w-full flex items-center justify-center text-xs text-neutral-600">
        Loading chart...
      </div>
    ),
  },
);

interface Snapshot {
  timestamp: string;
  listingsValue: number;
  estMarketCap: number | null;
  avgPrice: number;
  totalVolume: number;
}

type ChartMetric = CandleMetric;
type ViewMode = "area" | "candles";

const metricConfig = {
  estMarketCap: { label: "Est. Market Cap", format: (v: number) => formatPrice(v), color: "#8b5cf6" },
  listingsValue: { label: "Listings Value", format: (v: number) => formatPrice(v), color: "#a855f7" },
  avgPrice: { label: "Avg Price", format: (v: number) => `$${v.toFixed(2)}`, color: "#22c55e" },
  totalVolume: { label: "Volume", format: (v: number) => v.toLocaleString(), color: "#3b82f6" },
} as const;

const metrics: { key: ChartMetric; label: string }[] = [
  { key: "estMarketCap", label: "Est. Mkt Cap" },
  { key: "listingsValue", label: "Listings $" },
  { key: "avgPrice", label: "Avg Price" },
  { key: "totalVolume", label: "Volume" },
];

function formatShortDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Pick a candle bucket size based on the actual data window. Mirrors
 * the page-level PeriodSwitcher decisions without duplicating the UI.
 * Bucket math + label format live in candles.ts; this just maps a
 * day-span to a Period bucket.
 *
 * "LIVE" is reserved for the in-component override below — when the
 * user clicks the LIVE pill we fetch /api/trends?period=live (last
 * 6h, 10-min candles).
 */
function periodForSpan(snapshots: Snapshot[]): Period {
  if (snapshots.length < 2) return "30D";
  const first = new Date(snapshots[0].timestamp).getTime();
  const last = new Date(snapshots[snapshots.length - 1].timestamp).getTime();
  const hours = (last - first) / (60 * 60 * 1000);
  const days = hours / 24;
  if (hours <= 6) return "LIVE";
  if (days <= 1) return "24H";
  if (days <= 7) return "7D";
  if (days <= 30) return "30D";
  if (days <= 90) return "90D";
  return "ALL";
}

export function TrendsChartSection({ snapshots }: { snapshots: Snapshot[] }) {
  const hasEstCap = useMemo(
    () => snapshots.some((s) => s.estMarketCap != null && s.estMarketCap > 0),
    [snapshots],
  );
  const [chartMetric, setChartMetric] = useState<ChartMetric>(
    hasEstCap ? "estMarketCap" : "listingsValue",
  );
  const [view, setView] = useState<ViewMode>("area");

  const areaData = useMemo(
    () =>
      snapshots.map((s) => ({
        date: formatShortDate(s.timestamp),
        timestamp: s.timestamp,
        estMarketCap: s.estMarketCap ?? 0,
        listingsValue: s.listingsValue,
        avgPrice: s.avgPrice,
        totalVolume: s.totalVolume,
      })),
    [snapshots],
  );

  const candlePeriod = useMemo(() => periodForSpan(snapshots), [snapshots]);
  const candleData = useMemo(
    () => bucketize(snapshots, chartMetric, candlePeriod),
    [snapshots, chartMetric, candlePeriod],
  );

  const cfg = metricConfig[chartMetric];
  const empty =
    view === "candles" ? candleData.length === 0 : areaData.length === 0;

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5 mb-8">
      <div className="flex items-start justify-between mb-3 gap-3 flex-wrap">
        <h2 className="text-sm font-medium text-white">{cfg.label} Over Time</h2>
        <div className="flex items-center gap-1">
          {metrics.map((m) => (
            <Button
              key={m.key}
              variant={chartMetric === m.key ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setChartMetric(m.key)}
              className="text-xs h-7 px-2.5"
            >
              {m.label}
            </Button>
          ))}
        </div>
      </div>

      {/* View toggle — Area / Candles, TradingView-style segmented
          control. Period control lives at the page level above this
          section so we don't duplicate state. */}
      <div className="flex items-center mb-3">
        <div className="inline-flex items-center rounded-md border border-neutral-800 bg-neutral-950/40 p-0.5">
          <button
            type="button"
            onClick={() => setView("area")}
            className={`h-7 px-2.5 text-xs inline-flex items-center gap-1.5 rounded transition ${
              view === "area"
                ? "bg-neutral-800 text-white"
                : "text-neutral-500 hover:text-white"
            }`}
            aria-pressed={view === "area"}
          >
            <AreaIcon className="h-3.5 w-3.5" />
            Area
          </button>
          <button
            type="button"
            onClick={() => setView("candles")}
            className={`h-7 px-2.5 text-xs inline-flex items-center gap-1.5 rounded transition ${
              view === "candles"
                ? "bg-neutral-800 text-white"
                : "text-neutral-500 hover:text-white"
            }`}
            aria-pressed={view === "candles"}
          >
            <CandlestickChart className="h-3.5 w-3.5" />
            Candles
          </button>
        </div>
        {view === "candles" && (
          <span className="ml-3 text-[10px] uppercase tracking-wider text-neutral-600">
            {candlePeriod === "LIVE"
              ? "10m candles"
              : candlePeriod === "24H"
                ? "30m candles"
                : candlePeriod === "7D"
                  ? "1h candles"
                  : candlePeriod === "30D"
                    ? "4h candles"
                    : candlePeriod === "90D"
                      ? "1d candles"
                      : "3d candles"}
          </span>
        )}
      </div>

      <div className="h-72">
        {empty ? (
          <div className="h-full flex items-center justify-center text-neutral-500 text-sm">
            No historical data yet. Snapshots are captured each sync cycle.
          </div>
        ) : view === "candles" ? (
          <MarketCandleChart data={candleData} format={cfg.format} />
        ) : (
          <MarketAreaChart
            data={areaData}
            metric={chartMetric}
            metricConfig={metricConfig}
          />
        )}
      </div>
    </div>
  );
}
