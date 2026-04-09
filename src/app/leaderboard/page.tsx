"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Crown,
  TrendingUp,
  TrendingDown,
  Flame,
  BarChart3,
  ArrowDown,
  Loader2,
} from "lucide-react";
import { ItemImage } from "@/components/items/item-image";
import { formatPrice, formatPriceChange } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

interface Item {
  id: string;
  name: string;
  slug: string;
  type: string;
  imageUrl: string | null;
  currentPrice: number | null;
  lowestPrice: number | null;
  medianPrice: number | null;
  priceChange24h: number | null;
  volume: number | null;
}

type Tab = "expensive" | "gainers" | "losers" | "popular";

const tabs: { key: Tab; label: string; icon: typeof Crown }[] = [
  { key: "expensive", label: "Most Valuable", icon: Crown },
  { key: "gainers", label: "Top Gainers", icon: TrendingUp },
  { key: "losers", label: "Top Losers", icon: TrendingDown },
  { key: "popular", label: "Most Listed", icon: BarChart3 },
];

function LeaderboardTable({ items, showChange, showVolume, rank }: {
  items: Item[];
  showChange?: boolean;
  showVolume?: boolean;
  rank?: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-neutral-800 bg-neutral-900/30">
      <table className="w-full">
        <thead className="border-b border-neutral-800 bg-neutral-900/50">
          <tr>
            <th className="w-12 px-4 py-3 text-xs font-medium text-neutral-500 text-center">#</th>
            <th className="px-4 py-3 text-xs font-medium text-neutral-500 text-left uppercase tracking-wider">Item</th>
            <th className="px-4 py-3 text-xs font-medium text-neutral-500 text-right uppercase tracking-wider">Price</th>
            {showChange && (
              <th className="px-4 py-3 text-xs font-medium text-neutral-500 text-right uppercase tracking-wider">24h Change</th>
            )}
            {showVolume && (
              <th className="px-4 py-3 text-xs font-medium text-neutral-500 text-right uppercase tracking-wider">Listings</th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-800/50">
          {items.map((item, i) => {
            const change = item.priceChange24h ?? 0;
            return (
              <tr key={item.id} className="hover:bg-neutral-800/30 transition-colors">
                <td className="px-4 py-3 text-center">
                  {i < 3 ? (
                    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${
                      i === 0 ? "bg-amber-500/20 text-amber-400" :
                      i === 1 ? "bg-neutral-400/20 text-neutral-300" :
                      "bg-orange-500/20 text-orange-400"
                    }`}>
                      {i + 1}
                    </span>
                  ) : (
                    <span className="text-xs text-neutral-600">{i + 1}</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <Link href={`/items/${item.slug}`} className="flex items-center gap-3 group">
                    <ItemImage
                      src={item.imageUrl}
                      name={item.name}
                      type={item.type}
                      size="sm"
                      className="h-10 w-10 rounded-lg border border-neutral-700/50 shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-neutral-100 group-hover:text-white truncate">
                        {item.name}
                      </p>
                      <p className="text-[10px] text-neutral-500 capitalize">{item.type}</p>
                    </div>
                  </Link>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="text-sm font-semibold text-white">
                    {item.currentPrice != null ? formatPrice(item.currentPrice) : "—"}
                  </span>
                </td>
                {showChange && (
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-1">
                      {change > 0 ? (
                        <TrendingUp className="h-3 w-3 text-emerald-400" />
                      ) : change < 0 ? (
                        <TrendingDown className="h-3 w-3 text-red-400" />
                      ) : null}
                      <span className={`text-sm font-medium ${
                        change > 0 ? "text-emerald-400" : change < 0 ? "text-red-400" : "text-neutral-500"
                      }`}>
                        {formatPriceChange(change)}
                      </span>
                    </div>
                  </td>
                )}
                {showVolume && (
                  <td className="px-4 py-3 text-right text-sm text-neutral-400">
                    {item.volume != null ? item.volume.toLocaleString() : "—"}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function LeaderboardPage() {
  const [tab, setTab] = useState<Tab>("expensive");
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      const sortMap: Record<Tab, string> = {
        expensive: "price-desc",
        gainers: "change-desc",
        losers: "change-asc",
        popular: "volume-desc",
      };

      try {
        const res = await fetch(`/api/items?sort=${sortMap[tab]}&limit=25`);
        const data = await res.json();
        setItems(data.items ?? []);
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [tab]);

  const activeTab = tabs.find((t) => t.key === tab)!;

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-amber-500/10">
            <Flame className="h-5 w-5 text-amber-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">Leaderboard</h1>
        </div>
        <p className="text-sm text-neutral-500">
          Top S&box skins ranked by price, gains, losses, and popularity.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-neutral-900 border border-neutral-800 mb-6 overflow-x-auto">
        {tabs.map((t) => {
          const Icon = t.icon;
          const isActive = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                isActive
                  ? "bg-neutral-800 text-white"
                  : "text-neutral-500 hover:text-neutral-300"
              }`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Table */}
      {loading ? (
        <div className="rounded-xl border border-neutral-800 overflow-hidden">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-neutral-800/50">
              <Skeleton className="h-7 w-7 rounded-full" />
              <Skeleton className="h-10 w-10 rounded-lg" />
              <Skeleton className="h-4 w-36" />
              <div className="ml-auto flex gap-6">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-16" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <LeaderboardTable
          items={items}
          showChange={tab === "gainers" || tab === "losers" || tab === "expensive"}
          showVolume={tab === "popular" || tab === "expensive"}
        />
      )}
    </div>
  );
}
