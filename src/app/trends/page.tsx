"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  TrendingUp,
  TrendingDown,
  BarChart3,
  DollarSign,
  Activity,
  Package,
  Layers,
  Flame,
  ArrowDown,
  Minus,
} from "lucide-react";
import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ItemImage } from "@/components/items/item-image";
import { formatPrice, formatPriceChange } from "@/lib/utils";

interface Snapshot {
  timestamp: string;
  marketCap: number;
  avgPrice: number;
  totalVolume: number;
  totalItems: number;
  totalSupply: number | null;
  floor: number | null;
  ceiling: number | null;
}

interface MoverItem {
  name: string;
  slug: string;
  imageUrl: string | null;
  type: string;
  currentPrice: number | null;
  priceChange24h: number | null;
  volume: number | null;
}

interface Breakdown {
  [key: string]: { count: number; totalValue: number; avgPrice: number };
}

interface TrendsData {
  currentStats: {
    totalItems: number;
    marketCap: number;
    avgPrice: number;
    medianPrice: number;
    totalVolume: number;
    totalSupply: number;
    floor: number;
    ceiling: number;
  };
  snapshots: Snapshot[];
  typeBreakdown: Breakdown;
  storeStatusCounts: { available: number; delisted: number; unknown: number };
  topGainers: MoverItem[];
  topLosers: MoverItem[];
}

const periods = [
  { label: "7D", value: "7d" },
  { label: "30D", value: "30d" },
  { label: "90D", value: "90d" },
  { label: "All", value: "all" },
];

const TYPE_COLORS: Record<string, string> = {
  character: "#8b5cf6",
  clothing: "#ec4899",
  accessory: "#06b6d4",
  weapon: "#ef4444",
  tool: "#f59e0b",
  unknown: "#525252",
};

function formatShortDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function MoverRow({ item, rank }: { item: MoverItem; rank: number }) {
  const change = item.priceChange24h ?? 0;
  const isPositive = change > 0;

  return (
    <Link
      href={`/items/${item.slug}`}
      className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-neutral-800/50 transition-colors"
    >
      <span className="text-xs text-neutral-600 w-5 text-right">{rank}</span>
      <ItemImage
        src={item.imageUrl}
        name={item.name}
        type={item.type}
        size="sm"
        className="h-8 w-8 rounded-md border border-neutral-700/50 shrink-0"
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-neutral-100 truncate">{item.name}</p>
        <p className="text-[10px] text-neutral-500 capitalize">{item.type}</p>
      </div>
      <div className="text-right">
        <p className="text-sm text-white">{item.currentPrice != null ? formatPrice(item.currentPrice) : "—"}</p>
        <p className={`text-xs font-medium ${isPositive ? "text-emerald-400" : "text-red-400"}`}>
          {formatPriceChange(change)}
        </p>
      </div>
    </Link>
  );
}

export default function TrendsPage() {
  const [data, setData] = useState<TrendsData | null>(null);
  const [period, setPeriod] = useState("30d");
  const [loading, setLoading] = useState(true);
  const [chartMetric, setChartMetric] = useState<"marketCap" | "avgPrice" | "totalVolume">("marketCap");

  useEffect(() => {
    setLoading(true);
    fetch(`/api/trends?period=${period}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, [period]);

  const chartData = useMemo(() => {
    if (!data?.snapshots) return [];
    return data.snapshots.map((s) => ({
      date: formatShortDate(s.timestamp),
      timestamp: s.timestamp,
      marketCap: s.marketCap,
      avgPrice: s.avgPrice,
      totalVolume: s.totalVolume,
    }));
  }, [data]);

  const typeChartData = useMemo(() => {
    if (!data?.typeBreakdown) return [];
    return Object.entries(data.typeBreakdown)
      .map(([name, v]) => ({ name, value: v.count, totalValue: v.totalValue }))
      .sort((a, b) => b.value - a.value);
  }, [data]);

  const metricConfig = {
    marketCap: { label: "Market Cap", format: (v: number) => formatPrice(v), color: "#8b5cf6" },
    avgPrice: { label: "Avg Price", format: (v: number) => `$${v.toFixed(2)}`, color: "#22c55e" },
    totalVolume: { label: "Volume", format: (v: number) => v.toLocaleString(), color: "#3b82f6" },
  };

  if (loading && !data) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-80" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-20 text-center">
        <p className="text-neutral-500">Failed to load market data. Try refreshing.</p>
      </div>
    );
  }

  const s = data.currentStats;

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-purple-500/10">
            <BarChart3 className="h-5 w-5 text-purple-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">Market Trends</h1>
        </div>
        <p className="text-sm text-neutral-400">
          Track the S&box skin market: prices, volume, supply trends, and top movers.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="h-4 w-4 text-purple-400" />
            <span className="text-[10px] uppercase tracking-wider text-neutral-500">Market Cap</span>
          </div>
          <p className="text-xl font-bold text-white">{formatPrice(s.marketCap)}</p>
        </div>
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="h-4 w-4 text-emerald-400" />
            <span className="text-[10px] uppercase tracking-wider text-neutral-500">Avg Price</span>
          </div>
          <p className="text-xl font-bold text-white">{formatPrice(s.avgPrice)}</p>
          <p className="text-[10px] text-neutral-500">Median: {formatPrice(s.medianPrice)}</p>
        </div>
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Layers className="h-4 w-4 text-blue-400" />
            <span className="text-[10px] uppercase tracking-wider text-neutral-500">Total Listings</span>
          </div>
          <p className="text-xl font-bold text-white">{s.totalVolume.toLocaleString()}</p>
          <p className="text-[10px] text-neutral-500">{s.totalItems} unique items</p>
        </div>
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Package className="h-4 w-4 text-amber-400" />
            <span className="text-[10px] uppercase tracking-wider text-neutral-500">Price Range</span>
          </div>
          <p className="text-xl font-bold text-white">{formatPrice(s.floor)}</p>
          <p className="text-[10px] text-neutral-500">to {formatPrice(s.ceiling)}</p>
        </div>
      </div>

      {/* Main Chart */}
      <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-1">
            {(["marketCap", "avgPrice", "totalVolume"] as const).map((m) => (
              <Button
                key={m}
                variant={chartMetric === m ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setChartMetric(m)}
                className="text-xs h-7 px-2.5"
              >
                {metricConfig[m].label}
              </Button>
            ))}
          </div>
          <div className="flex gap-1">
            {periods.map((p) => (
              <Button
                key={p.value}
                variant={period === p.value ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setPeriod(p.value)}
                className="text-xs h-7 px-2.5"
              >
                {p.label}
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
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={metricConfig[chartMetric].color} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={metricConfig[chartMetric].color} stopOpacity={0} />
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
                  tickFormatter={(v) => metricConfig[chartMetric].format(v)}
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
                  formatter={(value) => [metricConfig[chartMetric].format(Number(value)), metricConfig[chartMetric].label]}
                />
                <Area
                  type="monotone"
                  dataKey={chartMetric}
                  stroke={metricConfig[chartMetric].color}
                  strokeWidth={2}
                  fill="url(#trendGrad)"
                  dot={false}
                  activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Two columns: Movers + Breakdowns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Top Gainers */}
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Flame className="h-4 w-4 text-emerald-400" />
            <h2 className="text-sm font-medium text-white">Top Gainers (24h)</h2>
          </div>
          {data.topGainers.length === 0 ? (
            <p className="text-xs text-neutral-600 text-center py-4">No gainers today</p>
          ) : (
            <div className="space-y-0.5">
              {data.topGainers.slice(0, 8).map((item, i) => (
                <MoverRow key={item.slug} item={item} rank={i + 1} />
              ))}
            </div>
          )}
        </div>

        {/* Top Losers */}
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
          <div className="flex items-center gap-2 mb-4">
            <ArrowDown className="h-4 w-4 text-red-400" />
            <h2 className="text-sm font-medium text-white">Top Losers (24h)</h2>
          </div>
          {data.topLosers.length === 0 ? (
            <p className="text-xs text-neutral-600 text-center py-4">No losers today</p>
          ) : (
            <div className="space-y-0.5">
              {data.topLosers.slice(0, 8).map((item, i) => (
                <MoverRow key={item.slug} item={item} rank={i + 1} />
              ))}
            </div>
          )}
        </div>

        {/* Breakdowns */}
        <div className="space-y-6">
          {/* By Type */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
            <h2 className="text-sm font-medium text-white mb-4">By Type</h2>
            <div className="flex items-center gap-4">
              <div className="w-24 h-24">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={typeChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={25}
                      outerRadius={40}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {typeChartData.map((entry) => (
                        <Cell key={entry.name} fill={TYPE_COLORS[entry.name] || "#525252"} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-1.5">
                {typeChartData.map((entry) => (
                  <div key={entry.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: TYPE_COLORS[entry.name] || "#525252" }}
                      />
                      <span className="text-neutral-300 capitalize">{entry.name}</span>
                    </div>
                    <span className="text-neutral-500">{entry.value} items</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
