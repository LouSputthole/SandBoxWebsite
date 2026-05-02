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
  Users,
  ShoppingCart,
  Clock,
  Calendar,
  Store,
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
import { Tooltip } from "@/components/ui/tooltip";
import { formatPriceChange } from "@/lib/utils";
import { Price } from "@/components/ui/price";

interface PricePoint {
  id: string;
  price: number;
  volume: number | null;
  timestamp: string;
}

interface TopHolder {
  name: string;
  steamId: string;
  avatarUrl: string;
  quantity: number;
  sharePercent: number;
}

export interface ItemDetailData {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  type: string;
  imageUrl: string | null;
  marketUrl: string | null;
  steamMarketId: string | null;
  sboxFullIdent: string | null;
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
  // sbox.dev enrichment
  releaseDate: string | null;
  releasePrice: number | null;
  uniqueOwners: number | null;
  soldPast24h: number | null;
  supplyOnMarket: number | null;
  totalSales: number | null;
  isActiveStoreItem: boolean;
  isPermanentStoreItem: boolean;
  leavingStoreAt: string | null;
  itemDisplayName: string | null;
  category: string | null;
  itemSubType: string | null;
  priceChange6h: number | null;
  priceChange6hPercent: number | null;
  topHolders: TopHolder[] | null;
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
            {item.isActiveStoreItem ? (
              <div className="flex items-center gap-1.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full px-3 py-1 text-xs font-medium">
                <Store className="h-3 w-3" />
                {item.leavingStoreAt
                  ? `In Store · Leaves ${formatTimeLeft(item.leavingStoreAt)}`
                  : item.isPermanentStoreItem
                    ? "Permanent Store Item"
                    : "In Store"}
              </div>
            ) : item.storeStatus === "delisted" ? (
              <div className="flex items-center gap-1.5 bg-red-500/20 text-red-400 border border-red-500/30 rounded-full px-3 py-1 text-xs font-medium">
                Not In Store
              </div>
            ) : null}
            {item.itemDisplayName && (
              <div className="bg-neutral-800/80 text-neutral-300 border border-neutral-700/50 rounded-full px-3 py-1 text-xs font-medium">
                {item.itemDisplayName}
              </div>
            )}
          </div>
        </div>

        {/* Info */}
        <div className="space-y-4">
          <div>
            <div className="flex items-center gap-2 text-sm text-neutral-500 mb-2">
              <span className="capitalize">{item.category ?? item.type}</span>
              {item.itemSubType && (
                <>
                  <span className="text-neutral-700">·</span>
                  <span>{item.itemSubType}</span>
                </>
              )}
            </div>
            <h1 className="text-3xl font-bold text-white">{item.name}</h1>
          </div>

          {item.description && (
            <p className="text-sm text-neutral-400 leading-relaxed">{item.description}</p>
          )}

          {/* Price */}
          <div className="flex items-end gap-4 flex-wrap">
            <span className="text-4xl font-bold text-white">
              {item.currentPrice != null ? <Price amount={item.currentPrice} /> : "N/A"}
            </span>
            <div className="flex items-center gap-3 pb-1">
              <div className="flex items-center gap-1">
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
              {item.priceChange6hPercent != null && item.priceChange6hPercent !== 0 && (
                <span
                  className={`text-xs font-medium ${
                    item.priceChange6hPercent > 0 ? "text-emerald-400/70" : "text-red-400/70"
                  }`}
                >
                  {item.priceChange6hPercent > 0 ? "+" : ""}{item.priceChange6hPercent.toFixed(1)}% (6h)
                </span>
              )}
            </div>
          </div>
          {item.releasePrice != null && (
            // Make the store price prominent when the item is currently
            // in the store and the market price is N/A — the store
            // price is the only real price signal in that case, so it
            // should stand out instead of looking like a footnote.
            //
            // Gate on isActiveStoreItem (set from sbox.dev's API,
            // reliable) rather than storeStatus (legacy column populated
            // by the often-flaky sbox.game Playwright scraper). Same
            // signal that powers the green "In Store" badge above —
            // these two should agree.
            item.isActiveStoreItem && item.currentPrice == null ? (
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] uppercase tracking-wider text-emerald-400/80 font-semibold">
                  Store price
                </span>
                <span className="text-2xl font-bold text-emerald-300 tabular-nums">
                  <Price amount={item.releasePrice} />
                </span>
                <span className="text-[11px] text-neutral-500">
                  in-game
                </span>
              </div>
            ) : (
              <p className="text-xs text-neutral-500">
                Store price: <Price amount={item.releasePrice} />
              </p>
            )
          )}

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card className="bg-neutral-900/80">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <DollarSign className="h-3.5 w-3.5 text-neutral-500" />
                  <span className="text-xs text-neutral-500">Lowest</span>
                </div>
                <span className="text-sm font-semibold text-white">
                  {item.lowestPrice != null ? <Price amount={item.lowestPrice} /> : "N/A"}
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
                  {item.medianPrice != null ? <Price amount={item.medianPrice} /> : "N/A"}
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
            <Card className="bg-neutral-900/80">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Users className="h-3.5 w-3.5 text-neutral-500" />
                  <span className="text-xs text-neutral-500">Owners</span>
                </div>
                <span className="text-sm font-semibold text-white">
                  {item.uniqueOwners?.toLocaleString() ?? "N/A"}
                </span>
              </CardContent>
            </Card>
            <Card className="bg-neutral-900/80">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <ShoppingCart className="h-3.5 w-3.5 text-neutral-500" />
                  <span className="text-xs text-neutral-500">Sold (24h)</span>
                </div>
                <span className="text-sm font-semibold text-white">
                  {item.soldPast24h?.toLocaleString() ?? "N/A"}
                </span>
              </CardContent>
            </Card>
            <Card className="bg-neutral-900/80">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Activity className="h-3.5 w-3.5 text-neutral-500" />
                  <span className="text-xs text-neutral-500">On Market</span>
                </div>
                <span className="text-sm font-semibold text-white">
                  {item.supplyOnMarket?.toLocaleString() ?? "N/A"}
                </span>
              </CardContent>
            </Card>
            <Card className="bg-neutral-900/80">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Calendar className="h-3.5 w-3.5 text-neutral-500" />
                  <span className="text-xs text-neutral-500">Released</span>
                </div>
                <span className="text-sm font-semibold text-white">
                  {item.releaseDate
                    ? new Date(item.releaseDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                    : "N/A"}
                </span>
                {item.releaseDate && (
                  <span className="text-[10px] text-neutral-500 block mt-0.5">
                    {formatReleaseAge(item.releaseDate)}
                  </span>
                )}
              </CardContent>
            </Card>
            <Card className="bg-neutral-900/80">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="h-3.5 w-3.5 text-neutral-500" />
                  <span className="text-xs text-neutral-500">Spread</span>
                  <Tooltip
                    asIcon
                    content="Difference between the current price (from Steam's search feed) and the lowest listed price (from Steam's priceoverview). Big gaps can mean the market's moving fast or one endpoint is cached behind the other."
                  />
                </div>
                <span className="text-sm font-semibold text-white">
                  {formatSpread(item.currentPrice, item.lowestPrice)}
                </span>
                <span className="text-[10px] text-neutral-500 block mt-0.5">
                  {formatSpreadPct(item.currentPrice, item.lowestPrice)}
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
            {item.sboxFullIdent && (
              <a
                href={`https://sbox.game/${item.sboxFullIdent.replace(".", "/")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex"
              >
                <Button variant="outline" className="gap-2">
                  View on sbox.game
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
          <PriceChart
            data={item.priceHistory}
            itemId={item.id}
            priceChange24h={item.priceChange24h}
          />
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
          <div className="flex items-center gap-2 mb-4">
            <h3 className="text-sm font-medium text-neutral-300">Buy &amp; Sell Orders</h3>
            <Tooltip
              asIcon
              content={
                <>
                  <span className="block mb-1 font-medium text-white">Order Book</span>
                  A live snapshot of all active buy and sell orders on the Steam Market. Shows what buyers are offering and what sellers are asking, at every price level. Fetched directly from Steam in real-time.
                </>
              }
            />
          </div>
          <OrderBook slug={item.slug} />
        </CardContent>
      </Card>

      {/* Top Holders */}
      {item.topHolders && item.topHolders.length > 0 && (
        <Card className="bg-neutral-900/80 mt-6">
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Users className="h-4 w-4 text-neutral-400" />
              <h3 className="text-sm font-medium text-neutral-300">Top Holders</h3>
              <span className="text-xs text-neutral-600">
                {item.uniqueOwners ? `${item.uniqueOwners} unique owners` : ""}
              </span>
            </div>
            <div className="space-y-1">
              {item.topHolders.map((holder, i) => (
                <a
                  key={holder.steamId}
                  href={`https://steamcommunity.com/profiles/${holder.steamId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-neutral-800/50 transition-colors"
                >
                  <span className="text-xs text-neutral-600 w-5 text-right">{i + 1}</span>
                  <img
                    src={holder.avatarUrl}
                    alt=""
                    className="h-8 w-8 rounded-full border border-neutral-700/50"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-neutral-100 truncate">{holder.name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-white">{holder.quantity}×</p>
                    <p className="text-[10px] text-neutral-500">
                      {holder.sharePercent.toFixed(0)}% of inventory
                    </p>
                  </div>
                </a>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function formatTimeLeft(dateStr: string): string {
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff <= 0) return "soon";
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  if (days > 0) return `in ${days}d ${hours}h`;
  return `in ${hours}h`;
}

function formatReleaseAge(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days < 7) return `${days}d ago`;
  if (days < 60) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  const years = (days / 365).toFixed(1);
  return `${years}y ago`;
}

function formatSpread(current: number | null, lowest: number | null): string {
  if (current == null || lowest == null) return "N/A";
  const diff = current - lowest;
  const sign = diff > 0 ? "+" : "";
  return `${sign}$${diff.toFixed(2)}`;
}

function formatSpreadPct(current: number | null, lowest: number | null): string {
  if (current == null || lowest == null || lowest === 0) return "—";
  const pct = ((current - lowest) / lowest) * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}% vs lowest`;
}
