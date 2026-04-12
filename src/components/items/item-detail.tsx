"use client";

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
  Package,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ItemImage } from "@/components/items/item-image";
import { PriceChart } from "@/components/charts/price-chart";
import { PriceAlertForm } from "@/components/alerts/price-alert-form";
import { OrderBook } from "@/components/items/order-book";
import { SpreadAnalysis } from "@/components/items/spread-analysis";
import { PriceSignals } from "@/components/items/price-signals";
import { WatchlistButton } from "@/components/items/watchlist-button";
import { formatPrice, formatPriceChange } from "@/lib/utils";

interface PricePoint {
  id: string;
  price: number;
  volume: number | null;
  timestamp: string;
}

export interface ItemDetailData {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  type: string;
  rarity: string | null;
  imageUrl: string | null;
  marketUrl: string | null;
  steamMarketId: string | null;
  currentPrice: number | null;
  lowestPrice: number | null;
  medianPrice: number | null;
  volume: number | null;
  totalSupply: number | null;
  priceChange24h: number | null;
  isLimited: boolean;
  storeStatus: string;
  delistedAt: string | null;
  storePrice: number | null;
  priceHistory: PricePoint[];
}

export function ItemDetail({ item }: { item: ItemDetailData }) {
  const change = item.priceChange24h ?? 0;

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
        <div className="relative">
          <ItemImage
            src={item.imageUrl}
            name={item.name}
            type={item.type}
            size="lg"
            className="rounded-xl border border-neutral-700/50 h-80"
          />
          <div className="absolute top-4 right-4 flex flex-col gap-2 items-end">
            {item.isLimited && (
              <div className="flex items-center gap-1.5 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-full px-3 py-1 text-xs font-medium">
                <Star className="h-3 w-3 fill-amber-400" />
                Limited
              </div>
            )}
            {item.storeStatus === "delisted" && (
              <div className="flex items-center gap-1.5 bg-red-500/20 text-red-400 border border-red-500/30 rounded-full px-3 py-1 text-xs font-medium">
                Delisted
              </div>
            )}
            {item.storeStatus === "available" && (
              <div className="flex items-center gap-1.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full px-3 py-1 text-xs font-medium">
                In Store
              </div>
            )}
          </div>
        </div>

        {/* Info */}
        <div className="space-y-4">
          <div>
            <span className="text-sm text-neutral-500 capitalize mb-2 block">{item.type}</span>
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
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
                  <span className="text-xs text-neutral-500">Listings</span>
                </div>
                <span className="text-sm font-semibold text-white">
                  {item.volume?.toLocaleString() ?? "N/A"}
                </span>
              </CardContent>
            </Card>
            <Card className="bg-neutral-900/80">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Package className="h-3.5 w-3.5 text-neutral-500" />
                  <span className="text-xs text-neutral-500">Total Supply</span>
                </div>
                <span className="text-sm font-semibold text-white">
                  {item.totalSupply?.toLocaleString() ?? "N/A"}
                </span>
              </CardContent>
            </Card>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-3">
            <WatchlistButton slug={item.slug} size="md" />
            {item.marketUrl && (
              <a
                href={item.marketUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex"
              >
                <Button variant="outline" className="gap-2">
                  Steam Market
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </a>
            )}
            <a
              href="https://sbox.game/metrics/skins"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex"
            >
              <Button variant="outline" className="gap-2">
                S&box Metrics
                <ExternalLink className="h-4 w-4" />
              </Button>
            </a>
            <PriceAlertForm
              itemId={item.id}
              itemName={item.name}
              currentPrice={item.currentPrice}
            />
          </div>
        </div>
      </div>

      {/* Price Chart */}
      <Card className="bg-neutral-900/80">
        <CardContent className="p-6">
          <PriceChart data={item.priceHistory} itemId={item.id} />
        </CardContent>
      </Card>

      {/* Price Signals */}
      <Card className="bg-neutral-900/80 mt-6">
        <CardContent className="p-6">
          <PriceSignals item={item} />
        </CardContent>
      </Card>

      {/* Spread Analysis */}
      <Card className="bg-neutral-900/80 mt-6">
        <CardContent className="p-6">
          <SpreadAnalysis slug={item.slug} />
        </CardContent>
      </Card>

      {/* Order Book */}
      <Card className="bg-neutral-900/80 mt-6">
        <CardContent className="p-6">
          <h3 className="text-sm font-medium text-neutral-300 mb-4">Buy & Sell Orders</h3>
          <OrderBook slug={item.slug} />
        </CardContent>
      </Card>
    </div>
  );
}
