"use client";

import { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/utils";

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

interface Snapshot {
  timestamp: string;
  listingsValue: number;
  estMarketCap: number | null;
  avgPrice: number;
  totalVolume: number;
}

type ChartMetric = "estMarketCap" | "listingsValue" | "avgPrice" | "totalVolume";

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

export function TrendsChartSection({ snapshots }: { snapshots: Snapshot[] }) {
  const hasEstCap = useMemo(
    () => snapshots.some((s) => s.estMarketCap != null && s.estMarketCap > 0),
    [snapshots],
  );
  const [chartMetric, setChartMetric] = useState<ChartMetric>(
    hasEstCap ? "estMarketCap" : "listingsValue",
  );

  const chartData = useMemo(
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

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5 mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-white">{metricConfig[chartMetric].label} Over Time</h2>
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

      <div className="h-72">
        {chartData.length === 0 ? (
          <div className="h-full flex items-center justify-center text-neutral-500 text-sm">
            No historical data yet. Snapshots are captured each sync cycle.
          </div>
        ) : (
          <MarketAreaChart
            data={chartData}
            metric={chartMetric}
            metricConfig={metricConfig}
          />
        )}
      </div>
    </div>
  );
}
