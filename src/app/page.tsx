"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  TrendingUp,
  ArrowRight,
  Flame,
  Crown,
  Package,
  DollarSign,
  Activity,
  Gamepad2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ItemCard } from "@/components/items/item-card";
import { Skeleton } from "@/components/ui/skeleton";

interface Item {
  id: string;
  name: string;
  slug: string;
  type: string;
  rarity: string | null;
  imageUrl: string | null;
  currentPrice: number | null;
  priceChange24h: number | null;
  volume: number | null;
  isLimited: boolean;
}

interface Stats {
  totalItems: number;
  avgPrice: number;
  totalVolume: number;
}

export default function HomePage() {
  const [trending, setTrending] = useState<Item[]>([]);
  const [expensive, setExpensive] = useState<Item[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [trendingRes, expensiveRes, allRes] = await Promise.all([
          fetch("/api/items?sort=change-desc&limit=6"),
          fetch("/api/items?sort=price-desc&limit=6"),
          fetch("/api/items?limit=1"),
        ]);

        const trendingData = await trendingRes.json();
        const expensiveData = await expensiveRes.json();
        const allData = await allRes.json();

        setTrending(trendingData.items);
        setExpensive(expensiveData.items);

        // Calculate stats from all items
        const statsRes = await fetch(`/api/items?limit=${allData.total}`);
        const statsData = await statsRes.json();
        const items = statsData.items as Item[];
        const prices = items.map((i) => i.currentPrice ?? 0);
        const volumes = items.map((i) => i.volume ?? 0);

        setStats({
          totalItems: allData.total,
          avgPrice: prices.reduce((a, b) => a + b, 0) / prices.length,
          totalVolume: volumes.reduce((a, b) => a + b, 0),
        });
      } catch (e) {
        console.error("Failed to fetch homepage data:", e);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-neutral-800">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/20 via-transparent to-blue-900/10" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20 sm:py-28">
          <div className="text-center max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-2 bg-purple-500/10 border border-purple-500/20 rounded-full px-4 py-1.5 mb-6">
              <Gamepad2 className="h-4 w-4 text-purple-400" />
              <span className="text-sm text-purple-300">S&box Marketplace Tracker</span>
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-6 tracking-tight">
              Track S&box Skin{" "}
              <span className="bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
                Prices & Trends
              </span>
            </h1>
            <p className="text-lg text-neutral-400 mb-8 max-w-2xl mx-auto">
              Browse all S&box skins on the Steam Community Market. Track price history,
              find trending items, and discover the best deals.
            </p>
            <div className="flex items-center justify-center gap-4">
              <Link href="/items">
                <Button size="lg" className="gap-2 bg-purple-600 hover:bg-purple-700 text-white">
                  Browse All Skins
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/items?sort=change-desc">
                <Button variant="outline" size="lg" className="gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Trending
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-b border-neutral-800 bg-neutral-900/30">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
          {loading ? (
            <div className="grid grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : stats ? (
            <div className="grid grid-cols-3 gap-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-500/10">
                  <Package className="h-5 w-5 text-purple-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">{stats.totalItems}</p>
                  <p className="text-xs text-neutral-500">Total Items</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-500/10">
                  <DollarSign className="h-5 w-5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">${stats.avgPrice.toFixed(2)}</p>
                  <p className="text-xs text-neutral-500">Avg Price</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <Activity className="h-5 w-5 text-blue-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">{stats.totalVolume.toLocaleString()}</p>
                  <p className="text-xs text-neutral-500">24h Volume</p>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {/* Trending Items */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-orange-500/10">
              <Flame className="h-5 w-5 text-orange-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Trending Now</h2>
              <p className="text-xs text-neutral-500">Biggest price gains in the last 24h</p>
            </div>
          </div>
          <Link href="/items?sort=change-desc">
            <Button variant="ghost" size="sm" className="text-neutral-400 gap-1">
              View All <ArrowRight className="h-3 w-3" />
            </Button>
          </Link>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-neutral-800 p-4">
                <Skeleton className="h-32 w-full mb-4 rounded-lg" />
                <Skeleton className="h-4 w-3/4 mb-2" />
                <Skeleton className="h-6 w-1/2" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {trending.map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </section>

      {/* Most Expensive */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10">
              <Crown className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Most Valuable</h2>
              <p className="text-xs text-neutral-500">Highest priced items on the market</p>
            </div>
          </div>
          <Link href="/items?sort=price-desc">
            <Button variant="ghost" size="sm" className="text-neutral-400 gap-1">
              View All <ArrowRight className="h-3 w-3" />
            </Button>
          </Link>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-neutral-800 p-4">
                <Skeleton className="h-32 w-full mb-4 rounded-lg" />
                <Skeleton className="h-4 w-3/4 mb-2" />
                <Skeleton className="h-6 w-1/2" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {expensive.map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
