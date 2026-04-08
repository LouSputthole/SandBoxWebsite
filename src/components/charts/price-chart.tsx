"use client";

import { useState, useMemo } from "react";
import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Area,
  Bar,
  ComposedChart,
} from "recharts";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface PricePoint {
  id: string;
  price: number;
  volume: number | null;
  timestamp: string;
}

interface PriceChartProps {
  data: PricePoint[];
  itemId: string;
}

const periods = [
  { label: "7D", value: "7d" },
  { label: "30D", value: "30d" },
  { label: "90D", value: "90d" },
  { label: "All", value: "all" },
];

function formatDateLabel(dateStr: string, totalDays: number): string {
  const d = new Date(dateStr);
  if (totalDays <= 7) {
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric" });
  }
  if (totalDays <= 90) {
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

function formatTooltipDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function PriceChart({ data: initialData, itemId }: PriceChartProps) {
  const [period, setPeriod] = useState("all");
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(false);

  const handlePeriodChange = async (newPeriod: string) => {
    setPeriod(newPeriod);
    setLoading(true);
    try {
      const res = await fetch(`/api/prices/${itemId}?period=${newPeriod}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const newData = await res.json();
      setData(newData);
    } catch (e) {
      console.error("Failed to fetch price history:", e);
    } finally {
      setLoading(false);
    }
  };

  const { chartData, stats, totalDays } = useMemo(() => {
    if (data.length === 0) {
      return { chartData: [], stats: null, totalDays: 0 };
    }

    const sorted = [...data].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const first = new Date(sorted[0].timestamp).getTime();
    const last = new Date(sorted[sorted.length - 1].timestamp).getTime();
    const days = Math.max(1, Math.ceil((last - first) / (1000 * 60 * 60 * 24)));

    const prices = sorted.map((p) => p.price);
    const high = Math.max(...prices);
    const low = Math.min(...prices);
    const avg = prices.reduce((sum, p) => sum + p, 0) / prices.length;
    const startPrice = prices[0];
    const endPrice = prices[prices.length - 1];
    const changePercent = startPrice > 0 ? ((endPrice - startPrice) / startPrice) * 100 : 0;

    const mapped = sorted.map((point) => ({
      timestamp: point.timestamp,
      date: formatDateLabel(point.timestamp, days),
      price: point.price,
      volume: point.volume ?? 0,
    }));

    return {
      chartData: mapped,
      stats: { high, low, avg, changePercent, startPrice, endPrice, count: sorted.length },
      totalDays: days,
    };
  }, [data]);

  const minPrice = stats ? stats.low * 0.95 : 0;
  const maxPrice = stats ? stats.high * 1.05 : 1;

  const hasVolume = chartData.some((d) => d.volume > 0);

  return (
    <div>
      {/* Header with period buttons */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-neutral-300">Price History</h3>
        <div className="flex gap-1">
          {periods.map((p) => (
            <Button
              key={p.value}
              variant={period === p.value ? "secondary" : "ghost"}
              size="sm"
              onClick={() => handlePeriodChange(p.value)}
              className="text-xs h-7 px-2.5"
              disabled={loading}
            >
              {p.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Summary stats */}
      {stats && chartData.length > 1 && (
        <div className="grid grid-cols-4 gap-3 mb-4">
          <div className="rounded-lg bg-neutral-800/50 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-0.5">High</div>
            <div className="text-sm font-semibold text-white">${stats.high.toFixed(2)}</div>
          </div>
          <div className="rounded-lg bg-neutral-800/50 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-0.5">Low</div>
            <div className="text-sm font-semibold text-white">${stats.low.toFixed(2)}</div>
          </div>
          <div className="rounded-lg bg-neutral-800/50 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-0.5">Average</div>
            <div className="text-sm font-semibold text-white">${stats.avg.toFixed(2)}</div>
          </div>
          <div className="rounded-lg bg-neutral-800/50 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-0.5">Change</div>
            <div className="flex items-center gap-1">
              {stats.changePercent > 0 ? (
                <TrendingUp className="h-3 w-3 text-emerald-400" />
              ) : stats.changePercent < 0 ? (
                <TrendingDown className="h-3 w-3 text-red-400" />
              ) : (
                <Minus className="h-3 w-3 text-neutral-500" />
              )}
              <span
                className={`text-sm font-semibold ${
                  stats.changePercent > 0
                    ? "text-emerald-400"
                    : stats.changePercent < 0
                      ? "text-red-400"
                      : "text-neutral-400"
                }`}
              >
                {stats.changePercent >= 0 ? "+" : ""}
                {stats.changePercent.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Chart */}
      <div className="h-64" style={{ width: "100%" }}>
        {loading ? (
          <div className="h-full flex items-center justify-center text-neutral-500 text-sm">
            Loading...
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-full flex items-center justify-center text-neutral-500 text-sm">
            No price data available
          </div>
        ) : chartData.length === 1 ? (
          <div className="h-full flex flex-col items-center justify-center gap-2">
            <span className="text-3xl font-bold text-white">${chartData[0].price.toFixed(2)}</span>
            <span className="text-xs text-neutral-500">
              Single data point — {formatTooltipDate(chartData[0].timestamp)}
            </span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData}>
              <defs>
                <linearGradient id={`priceGrad-${itemId}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
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
                yAxisId="price"
                stroke="#525252"
                tick={{ fill: "#737373", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                domain={[minPrice, maxPrice]}
                tickFormatter={(v) => `$${v.toFixed(2)}`}
                width={65}
              />
              {hasVolume && (
                <YAxis
                  yAxisId="volume"
                  orientation="right"
                  stroke="transparent"
                  tick={false}
                  axisLine={false}
                  tickLine={false}
                  width={0}
                  domain={[0, (dataMax: number) => dataMax * 4]}
                />
              )}
              <Tooltip
                contentStyle={{
                  backgroundColor: "#1a1a2e",
                  border: "1px solid #333",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
                labelStyle={{ color: "#999" }}
                labelFormatter={(_, payload) => {
                  if (payload?.[0]?.payload?.timestamp) {
                    return formatTooltipDate(payload[0].payload.timestamp);
                  }
                  return "";
                }}
                formatter={(value, name) => {
                  const v = Number(value);
                  if (name === "price") return [`$${v.toFixed(2)}`, "Price"];
                  if (name === "volume") return [v.toLocaleString(), "Volume"];
                  return [String(value), String(name)];
                }}
              />
              {hasVolume && (
                <Bar
                  yAxisId="volume"
                  dataKey="volume"
                  fill="#8b5cf6"
                  opacity={0.15}
                  radius={[2, 2, 0, 0]}
                />
              )}
              <Area
                yAxisId="price"
                type="monotone"
                dataKey="price"
                stroke="#8b5cf6"
                strokeWidth={2}
                fill={`url(#priceGrad-${itemId})`}
                dot={false}
                activeDot={{ r: 4, fill: "#8b5cf6", stroke: "#fff", strokeWidth: 2 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Data point count */}
      {stats && (
        <div className="mt-2 text-right">
          <span className="text-[10px] text-neutral-600">
            {stats.count} data point{stats.count !== 1 ? "s" : ""}
          </span>
        </div>
      )}
    </div>
  );
}
