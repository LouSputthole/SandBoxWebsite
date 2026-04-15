import Link from "next/link";
import {
  BarChart3,
  DollarSign,
  Activity,
  Package,
  Layers,
  Flame,
  ArrowDown,
} from "lucide-react";
import { ItemImage } from "@/components/items/item-image";
import { TrendsChartSection } from "@/components/trends/trends-chart-section";
import { PeriodSwitcher } from "@/components/trends/period-switcher";
import { TypePieChartWrapper } from "@/components/trends/type-pie-chart-wrapper";
import { getTrendsData, type TrendsPeriod } from "@/lib/services/trends";
import { formatPrice, formatPriceChange } from "@/lib/utils";

// ISR — regenerate every 5 minutes so search engines get cached HTML
export const revalidate = 300;

const TYPE_COLORS: Record<string, string> = {
  character: "#8b5cf6",
  clothing: "#ec4899",
  accessory: "#06b6d4",
  weapon: "#ef4444",
  tool: "#f59e0b",
  unknown: "#525252",
};

const VALID_PERIODS: TrendsPeriod[] = ["7d", "30d", "90d", "all"];

function isValidPeriod(p: string | undefined): p is TrendsPeriod {
  return p !== undefined && (VALID_PERIODS as string[]).includes(p);
}

interface PageProps {
  searchParams: Promise<{ period?: string }>;
}

export default async function TrendsPage({ searchParams }: PageProps) {
  const { period: rawPeriod } = await searchParams;
  const period: TrendsPeriod = isValidPeriod(rawPeriod) ? rawPeriod : "30d";

  const data = await getTrendsData(period);
  const s = data.currentStats;

  // Pre-build view data the chart section needs (serialize timestamps for client)
  const snapshots = data.snapshots.map((sn) => ({
    timestamp: sn.timestamp.toISOString(),
    listingsValue: sn.listingsValue,
    estMarketCap: sn.estMarketCap,
    avgPrice: sn.avgPrice,
    totalVolume: sn.totalVolume,
  }));

  const typeChartData = Object.entries(data.typeBreakdown)
    .map(([name, v]) => ({ name, value: v.count, totalValue: v.totalValue }))
    .sort((a, b) => b.value - a.value);

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8 flex items-end justify-between flex-wrap gap-4">
        <div>
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
        <PeriodSwitcher currentPeriod={period} />
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="h-4 w-4 text-purple-400" />
            <span className="text-[10px] uppercase tracking-wider text-neutral-500">Est. Market Cap</span>
          </div>
          <p className="text-xl font-bold text-white">
            {s.estMarketCap > 0 ? formatPrice(s.estMarketCap) : "—"}
          </p>
          <p className="text-[10px] text-neutral-500">
            {s.estMarketCap > 0 && s.estMarketCapItemCount < s.totalItems
              ? `${s.estMarketCapItemCount}/${s.totalItems} w/ supply · `
              : ""}
            Listings: {formatPrice(s.listingsValue)}
          </p>
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

      {/* Main chart with metric switcher (client) */}
      <TrendsChartSection snapshots={snapshots} />

      {/* Movers + Type breakdown */}
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

        {/* By Type */}
        <div className="space-y-6">
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
            <h2 className="text-sm font-medium text-white mb-4">By Type</h2>
            <div className="flex items-center gap-4">
              <div className="w-24 h-24">
                <TypePieChartWrapper data={typeChartData} colors={TYPE_COLORS} />
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

interface MoverItem {
  name: string;
  slug: string;
  imageUrl: string | null;
  type: string;
  currentPrice: number | null;
  priceChange24h: number | null;
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
