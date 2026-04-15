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
 * Market history area chart. Extracted from the trends page so recharts is
 * lazy-loaded via next/dynamic and doesn't bloat the initial JS bundle.
 */

interface ChartPoint {
  date: string;
  estMarketCap: number;
  listingsValue: number;
  avgPrice: number;
  totalVolume: number;
}

export type ChartMetric = "estMarketCap" | "listingsValue" | "avgPrice" | "totalVolume";

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

export default function MarketAreaChart({
  data,
  metric,
  metricConfig,
}: MarketAreaChartProps) {
  const cfg = metricConfig[metric];
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
          dataKey="date"
          stroke="#525252"
          tick={{ fill: "#737373", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
          minTickGap={40}
        />
        <YAxis
          stroke="#525252"
          tick={{ fill: "#737373", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => cfg.format(v)}
          width={80}
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
        />
        <Area
          type="monotone"
          dataKey={metric}
          stroke={cfg.color}
          strokeWidth={2}
          fill="url(#trendGrad)"
          dot={false}
          activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
