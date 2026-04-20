"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Heart,
  TrendingUp,
  TrendingDown,
  Minus,
  Trash2,
  DollarSign,
  BarChart3,
  ArrowUpDown,
} from "lucide-react";
import { useWatchlist } from "@/lib/watchlist/context";
import { ItemImage } from "@/components/items/item-image";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatPriceChange } from "@/lib/utils";
import { Price } from "@/components/ui/price";

interface PortfolioItem {
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
  isLimited: boolean;
  storeStatus: string;
}

interface PortfolioData {
  items: PortfolioItem[];
  totalValue: number;
  totalChange: number;
  itemCount: number;
  gainers: number;
  losers: number;
}

type SortKey = "name" | "price" | "change" | "volume";

export function PortfolioView() {
  const { watchlist, toggle, clear } = useWatchlist();
  const [data, setData] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("price");
  const [sortAsc, setSortAsc] = useState(false);

  useEffect(() => {
    if (watchlist.length === 0) {
      setData(null);
      return;
    }

    setLoading(true);
    fetch("/api/portfolio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slugs: watchlist }),
    })
      .then((res) => res.json())
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [watchlist]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  const sortedItems = data
    ? [...data.items].sort((a, b) => {
        let cmp = 0;
        switch (sortKey) {
          case "name":
            cmp = a.name.localeCompare(b.name);
            break;
          case "price":
            cmp = (a.currentPrice ?? 0) - (b.currentPrice ?? 0);
            break;
          case "change":
            cmp = (a.priceChange24h ?? 0) - (b.priceChange24h ?? 0);
            break;
          case "volume":
            cmp = (a.volume ?? 0) - (b.volume ?? 0);
            break;
        }
        return sortAsc ? cmp : -cmp;
      })
    : [];

  if (watchlist.length === 0) {
    return (
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-16 text-center">
        <Heart className="h-16 w-16 text-neutral-700 mx-auto mb-6" />
        <h1 className="text-2xl font-bold text-white mb-3">Your Watchlist is Empty</h1>
        <p className="text-neutral-400 mb-8 max-w-md mx-auto">
          Browse items and click the heart icon to add them to your watchlist. Track prices and changes all in one place.
        </p>
        <Link href="/items">
          <Button variant="outline">Browse Items</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Watchlist</h1>
          <p className="text-sm text-neutral-500 mt-1">
            {watchlist.length} item{watchlist.length !== 1 ? "s" : ""} tracked
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-neutral-500 hover:text-red-400 gap-2"
          onClick={clear}
        >
          <Trash2 className="h-4 w-4" />
          Clear All
        </Button>
      </div>

      {/* Summary Cards */}
      {data && !loading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <Card className="bg-neutral-900/80">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="h-3.5 w-3.5 text-neutral-500" />
                <span className="text-xs text-neutral-500">Total Value</span>
              </div>
              <span className="text-lg font-bold text-white">
                <Price amount={data.totalValue} />
              </span>
            </CardContent>
          </Card>
          <Card className="bg-neutral-900/80">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <BarChart3 className="h-3.5 w-3.5 text-neutral-500" />
                <span className="text-xs text-neutral-500">Avg Price</span>
              </div>
              <span className="text-lg font-bold text-white">
                {data.itemCount > 0
                  ? <Price amount={data.totalValue / data.itemCount} />
                  : "N/A"}
              </span>
            </CardContent>
          </Card>
          <Card className="bg-neutral-900/80">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                <span className="text-xs text-neutral-500">Gainers</span>
              </div>
              <span className="text-lg font-bold text-emerald-400">
                {data.gainers}
              </span>
            </CardContent>
          </Card>
          <Card className="bg-neutral-900/80">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <TrendingDown className="h-3.5 w-3.5 text-red-500" />
                <span className="text-xs text-neutral-500">Losers</span>
              </div>
              <span className="text-lg font-bold text-red-400">
                {data.losers}
              </span>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="text-center py-12">
          <div className="h-8 w-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-neutral-500">Loading watchlist data...</p>
        </div>
      )}

      {/* Items Table */}
      {data && !loading && (
        <Card className="bg-neutral-900/80 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-neutral-800">
                  <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider w-10" />
                  <SortHeader
                    label="Item"
                    sortKey="name"
                    currentKey={sortKey}
                    asc={sortAsc}
                    onClick={handleSort}
                  />
                  <SortHeader
                    label="Price"
                    sortKey="price"
                    currentKey={sortKey}
                    asc={sortAsc}
                    onClick={handleSort}
                    className="text-right"
                  />
                  <SortHeader
                    label="24h Change"
                    sortKey="change"
                    currentKey={sortKey}
                    asc={sortAsc}
                    onClick={handleSort}
                    className="text-right"
                  />
                  <SortHeader
                    label="Listings"
                    sortKey="volume"
                    currentKey={sortKey}
                    asc={sortAsc}
                    onClick={handleSort}
                    className="text-right hidden sm:table-cell"
                  />
                  <th className="text-right px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider w-12" />
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/50">
                {sortedItems.map((item) => {
                  const change = item.priceChange24h ?? 0;
                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-neutral-800/30 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <ItemImage
                          src={item.imageUrl}
                          name={item.name}
                          type={item.type}
                          size="sm"
                          className="h-10 w-10 rounded border border-neutral-700/50"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/items/${item.slug}`}
                          className="text-sm font-medium text-neutral-100 hover:text-white transition-colors"
                        >
                          {item.name}
                        </Link>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-neutral-500 capitalize">
                            {item.type}
                          </span>
                          {item.isLimited && (
                            <span className="text-[10px] text-amber-400">
                              Limited
                            </span>
                          )}
                          {item.storeStatus === "delisted" && (
                            <span className="text-[10px] text-red-400">
                              Delisted
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-semibold text-white">
                          {item.currentPrice != null
                            ? <Price amount={item.currentPrice} />
                            : "N/A"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {change > 0 ? (
                            <TrendingUp className="h-3 w-3 text-emerald-400" />
                          ) : change < 0 ? (
                            <TrendingDown className="h-3 w-3 text-red-400" />
                          ) : (
                            <Minus className="h-3 w-3 text-neutral-500" />
                          )}
                          <span
                            className={`text-xs font-medium ${
                              change > 0
                                ? "text-emerald-400"
                                : change < 0
                                  ? "text-red-400"
                                  : "text-neutral-500"
                            }`}
                          >
                            {formatPriceChange(change)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right hidden sm:table-cell">
                        <span className="text-xs text-neutral-400">
                          {item.volume?.toLocaleString() ?? "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => toggle(item.slug)}
                          className="text-neutral-600 hover:text-red-400 transition-colors"
                          title="Remove from watchlist"
                        >
                          <Heart className="h-4 w-4 fill-pink-400 text-pink-400" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function SortHeader({
  label,
  sortKey,
  currentKey,
  asc,
  onClick,
  className = "",
}: {
  label: string;
  sortKey: SortKey;
  currentKey: SortKey;
  asc: boolean;
  onClick: (key: SortKey) => void;
  className?: string;
}) {
  const active = sortKey === currentKey;
  return (
    <th
      className={`px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider cursor-pointer hover:text-neutral-300 transition-colors select-none ${className}`}
      onClick={() => onClick(sortKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <ArrowUpDown
          className={`h-3 w-3 ${active ? "text-purple-400" : "text-neutral-600"}`}
        />
        {active && (
          <span className="text-[9px] text-purple-400">
            {asc ? "↑" : "↓"}
          </span>
        )}
      </span>
    </th>
  );
}
