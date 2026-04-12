import Link from "next/link";
import { TrendingUp, TrendingDown, Minus, Star } from "lucide-react";
import { ItemImage } from "@/components/items/item-image";
import { WatchlistButton } from "@/components/items/watchlist-button";
import { formatPrice, formatPriceChange } from "@/lib/utils";

interface ItemCardProps {
  item: {
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
  };
}

export function ItemCard({ item }: ItemCardProps) {
  const change = item.priceChange24h ?? 0;

  return (
    <Link href={`/items/${item.slug}`}>
      <div
        className="group relative rounded-xl border border-neutral-800 bg-neutral-900/50 p-4 transition-all duration-200 hover:border-neutral-700 hover:bg-neutral-900 hover:shadow-lg"
      >
        <div className="absolute top-3 left-3 z-10">
          <WatchlistButton slug={item.slug} size="sm" />
        </div>
        {item.isLimited && (
          <div className="absolute top-3 right-3 z-10">
            <Star className="h-4 w-4 text-amber-400 fill-amber-400" />
          </div>
        )}

        {/* Image */}
        <ItemImage
          src={item.imageUrl}
          name={item.name}
          type={item.type}
          size="sm"
          className="mx-auto mb-4 h-32 w-32 rounded-lg border border-neutral-700/50"
        />

        {/* Info */}
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-medium text-neutral-100 group-hover:text-white line-clamp-1">
              {item.name}
            </h3>
          </div>

          <span className="text-[10px] text-neutral-500 capitalize">{item.type}</span>

          <div className="flex items-end justify-between pt-1">
            <span className="text-lg font-bold text-white">
              {item.currentPrice != null ? formatPrice(item.currentPrice) : "N/A"}
            </span>
            <div className="flex items-center gap-1">
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
          </div>

          {item.volume != null && (
            <p className="text-[10px] text-neutral-600">
              Vol: {item.volume.toLocaleString()}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}
