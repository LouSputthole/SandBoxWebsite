"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ExternalLink,
  TrendingUp,
  TrendingDown,
  Minus,
  Star,
  BarChart3,
  DollarSign,
  Activity,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PriceChart } from "@/components/charts/price-chart";
import { formatPrice, formatPriceChange } from "@/lib/utils";

interface PricePoint {
  id: string;
  price: number;
  volume: number | null;
  timestamp: string;
}

interface ItemDetail {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  type: string;
  rarity: string | null;
  imageUrl: string | null;
  marketUrl: string | null;
  currentPrice: number | null;
  lowestPrice: number | null;
  medianPrice: number | null;
  volume: number | null;
  priceChange24h: number | null;
  isLimited: boolean;
  priceHistory: PricePoint[];
}

const rarityColors: Record<string, string> = {
  common: "text-neutral-400",
  uncommon: "text-emerald-400",
  rare: "text-blue-400",
  legendary: "text-purple-400",
};

const rarityBadgeColors: Record<string, string> = {
  common: "bg-neutral-500/20 text-neutral-300 border-neutral-500/30",
  uncommon: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  rare: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  legendary: "bg-purple-500/20 text-purple-400 border-purple-500/30",
};

export default function ItemDetailPage() {
  const params = useParams();
  const [item, setItem] = useState<ItemDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function fetchItem() {
      try {
        const res = await fetch(`/api/items/${params.slug}`);
        if (!res.ok) throw new Error("Not found");
        const data = await res.json();
        setItem(data);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    }
    fetchItem();
  }, [params.slug]);

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8">
        <Skeleton className="h-6 w-24 mb-8" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <Skeleton className="h-80 rounded-xl" />
          <div className="space-y-4">
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-12 w-1/3" />
            <Skeleton className="h-20 w-full" />
          </div>
        </div>
        <Skeleton className="h-64 mt-8 rounded-xl" />
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-20 text-center">
        <h1 className="text-2xl font-bold text-white mb-2">Item Not Found</h1>
        <p className="text-neutral-500 mb-6">
          The item you&apos;re looking for doesn&apos;t exist or has been removed.
        </p>
        <Link href="/items">
          <Button variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Browse
          </Button>
        </Link>
      </div>
    );
  }

  const change = item.priceChange24h ?? 0;
  const rarity = item.rarity ?? "common";

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8">
      {/* Back */}
      <Link
        href="/items"
        className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-white transition-colors mb-8"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Browse
      </Link>

      {/* Item Header */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
        {/* Image */}
        <div
          className={`relative rounded-xl border rarity-bg-${rarity} flex items-center justify-center h-80`}
        >
          {item.isLimited && (
            <div className="absolute top-4 right-4 flex items-center gap-1.5 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-full px-3 py-1 text-xs font-medium">
              <Star className="h-3 w-3 fill-amber-400" />
              Limited
            </div>
          )}
          <div className={`text-8xl font-bold opacity-20 rarity-${rarity}`}>
            {item.name.charAt(0)}
          </div>
        </div>

        {/* Info */}
        <div className="space-y-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Badge className={`border ${rarityBadgeColors[rarity] || rarityBadgeColors.common}`}>
                {rarity}
              </Badge>
              <span className="text-sm text-neutral-500 capitalize">{item.type}</span>
            </div>
            <h1 className="text-3xl font-bold text-white">{item.name}</h1>
          </div>

          {item.description && (
            <p className="text-sm text-neutral-400 leading-relaxed">{item.description}</p>
          )}

          {/* Price */}
          <div className="flex items-end gap-4">
            <span className="text-4xl font-bold text-white">
              {item.currentPrice != null ? formatPrice(item.currentPrice) : "N/A"}
            </span>
            <div className="flex items-center gap-1 pb-1">
              {change > 0 ? (
                <TrendingUp className="h-4 w-4 text-emerald-400" />
              ) : change < 0 ? (
                <TrendingDown className="h-4 w-4 text-red-400" />
              ) : (
                <Minus className="h-4 w-4 text-neutral-500" />
              )}
              <span
                className={`text-sm font-medium ${
                  change > 0 ? "text-emerald-400" : change < 0 ? "text-red-400" : "text-neutral-500"
                }`}
              >
                {formatPriceChange(change)} (24h)
              </span>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            <Card className="bg-neutral-900/80">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <DollarSign className="h-3.5 w-3.5 text-neutral-500" />
                  <span className="text-xs text-neutral-500">Lowest</span>
                </div>
                <span className="text-sm font-semibold text-white">
                  {item.lowestPrice != null ? formatPrice(item.lowestPrice) : "N/A"}
                </span>
              </CardContent>
            </Card>
            <Card className="bg-neutral-900/80">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <BarChart3 className="h-3.5 w-3.5 text-neutral-500" />
                  <span className="text-xs text-neutral-500">Median</span>
                </div>
                <span className="text-sm font-semibold text-white">
                  {item.medianPrice != null ? formatPrice(item.medianPrice) : "N/A"}
                </span>
              </CardContent>
            </Card>
            <Card className="bg-neutral-900/80">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Activity className="h-3.5 w-3.5 text-neutral-500" />
                  <span className="text-xs text-neutral-500">Volume</span>
                </div>
                <span className="text-sm font-semibold text-white">
                  {item.volume?.toLocaleString() ?? "N/A"}
                </span>
              </CardContent>
            </Card>
          </div>

          {/* Market Link */}
          {item.marketUrl && (
            <a
              href={item.marketUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex"
            >
              <Button variant="outline" className="gap-2">
                View on Steam Market
                <ExternalLink className="h-4 w-4" />
              </Button>
            </a>
          )}
        </div>
      </div>

      {/* Price Chart */}
      <Card className="bg-neutral-900/80">
        <CardContent className="p-6">
          <PriceChart data={item.priceHistory} itemId={item.id} />
        </CardContent>
      </Card>
    </div>
  );
}
