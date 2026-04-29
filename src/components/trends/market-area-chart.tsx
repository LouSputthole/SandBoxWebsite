"use client";

import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from "recharts";

/**
 * Market history area chart. Extracted from the trends page so recharts
 * is lazy-loaded via next/dynamic and doesn't bloat the initial JS
 * bundle.
 *
 * X-axis uses the raw `timestamp` (an ISO string) as `dataKey` so every
 * point is unique. We display the human-readable date via
 * `tickFormatter` / `labelFormatter`. Without this, dozens of snapshots
 * sharing the same "Apr 28" date string collide on the X axis and the
 * activeDot pins to the first match instead of following the cursor —
 * showed up as a stuck dot on the left while the tooltip floated mid-
 * chart.
 *
 * Y-axis domain is auto-padded around the actual min/max so the line
 * doesn't get squashed into the top tenth of the chart when total
 * market cap fluctuates in a single-digit % range over a day.
 */

interface ChartPoint {
  date: string;
  timestamp: string;
  estMarketCap: number;
  listingsValue: number;
  avgPrice: number;
  totalVolume: number;
}

export type ChartMetric =
  | "estMarketCap"
  | "listingsValue"
  | "avgPrice"
  | "totalVolume";

interface MetricConfig {
  label: string;
  format: (v: number) => string;
  color: string;
}

interface MarketAreaChartProps {
  data: ChartPoint[];
  metric: ChartMetric;
  metricConfig: Record<ChartMetric, MetricConfig>;
}

function formatTick(timestamp: string): string {
  const d = new Date(timestamp);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatTooltipLabel(timestamp: string): string {
  const d = new Date(timestamp);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function MarketAreaChart({
  data,
  metric,
  metricConfig,
}: MarketAreaChartProps) {
  const cfg = metricConfig[metric];

  // Tight y-domain so the line breathes in its actual range. 5% padding
  // each side feels right for a market chart; clamping the lower end at
  // 0 prevents avgPrice/Volume from going negative on the axis.
  const values = data.map((d) => d[metric]).filter((v) => v > 0);
  const min = values.length > 0 ? Math.min(...values) : 0;
  const max = values.length > 0 ? Math.max(...values) : 1;
  const pad = (max - min) * 0.05;
  const yDomain: [number, number] = [
    Math.max(0, min - pad),
    max + pad,
  ];

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data}>
        <defs>
          <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={cfg.color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={cfg.color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="timestamp"
          stroke="#525252"
          tick={{ fill: "#737373", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
          minTickGap={40}
          tickFormatter={formatTick}
        />
        <YAxis
          stroke="#525252"
          tick={{ fill: "#737373", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => cfg.format(v)}
          width={80}
          domain={yDomain}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "#1a1a2e",
            border: "1px solid #333",
            borderRadius: "8px",
            fontSize: "12px",
          }}
          labelStyle={{ color: "#999" }}
          formatter={(value) => [cfg.format(Number(value)), cfg.label]}
          labelFormatter={(label) => formatTooltipLabel(String(label))}
        />
        <Area
          type="monotone"
          dataKey={metric}
          stroke={cfg.color}
          strokeWidth={2}
          fill="url(#trendGrad)"
          dot={false}
          activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2 }}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
