import type { CSSProperties } from "react";
import Link from "next/link";
import { TrendingUp, TrendingDown, Minus, Star } from "lucide-react";
import { SkinTile } from "@/components/items/skin-tile";
import { WatchlistButton } from "@/components/items/watchlist-button";
import { formatPriceChange } from "@/lib/utils";
import { rarityCssColor, rarityLabel } from "@/lib/rarity";
import { Price } from "@/components/ui/price";

interface ItemCardProps {
  item: {
    id: string;
    name: string;
    slug: string;
    type: string;
    imageUrl: string | null;
    currentPrice: number | null;
    priceChange24h: number | null;
    volume: number | null;
    isLimited: boolean;
    // Steam-sourced rarity tint, when the item has one. Optional so call
    // sites that don't select it (or items with no rarity) just omit it.
    rarityColor?: string | null;
  };
}

export function ItemCard({ item }: ItemCardProps) {
  const change = item.priceChange24h ?? 0;
  // Pure helpers — safe in the render body. Both return null when the item
  // has no (valid) rarity color, which is how we gate the indicator below.
  const rarityColor = rarityCssColor(item.rarityColor);
  const rarityName = rarityLabel(item.rarityColor);

  // Hover border brightens toward the item's rarity (or accent) color.
  const cardStyle = {
    "--rc": rarityColor ?? "var(--accent)",
  } as CSSProperties;

  return (
    <Link href={`/items/${item.slug}`}>
      <div
        style={cardStyle}
        className="group relative rounded-[18px] border border-[var(--line)] bg-[var(--panel)] p-3 transition-[transform,border-color] duration-150 hover:-translate-y-1 hover:[border-color:color-mix(in_srgb,var(--rc)_55%,var(--line))]"
      >
        <div className="absolute left-3 top-3 z-20">
          <WatchlistButton slug={item.slug} size="sm" />
        </div>
        {item.isLimited && (
          <div className="absolute right-3 top-3 z-20">
            <Star className="h-4 w-4 fill-[var(--cat-tool)] text-[var(--cat-tool)]" />
          </div>
        )}

        {/* Skin tile (rarity-gradient frame + real image / category glyph) */}
        <SkinTile
          imageUrl={item.imageUrl}
          name={item.name}
          type={item.type}
          rarityColor={rarityColor}
          iconSize="lg"
          className="mb-3"
        />

        {/* Info */}
        <div className="space-y-1.5">
          <h3 className="line-clamp-1 font-sans text-sm font-bold text-[var(--tx)]">
            {item.name}
          </h3>

          <div className="flex items-center gap-2">
            <span className="text-[11px] capitalize text-[var(--faint)]">
              {item.type}
            </span>
            {rarityColor && (
              <span
                className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--mut)]"
                title={rarityName ? `Rarity: ${rarityName}` : "Rarity"}
              >
                <span
                  className="h-2 w-2 rounded-full ring-1 ring-inset ring-white/10"
                  style={{ backgroundColor: rarityColor }}
                  aria-hidden
                />
                {rarityName && <span>{rarityName}</span>}
              </span>
            )}
          </div>

          <div className="flex items-end justify-between pt-0.5">
            <span className="font-mono text-lg font-bold text-[var(--tx)]">
              {item.currentPrice != null ? (
                <Price amount={item.currentPrice} />
              ) : (
                <span className="text-[var(--faint)]">N/A</span>
              )}
            </span>
            <span
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-xs font-bold"
              style={{
                color:
                  change > 0
                    ? "var(--up)"
                    : change < 0
                    ? "var(--down)"
                    : "var(--mut)",
                backgroundColor:
                  change > 0
                    ? "color-mix(in srgb, var(--up) 16%, transparent)"
                    : change < 0
                    ? "color-mix(in srgb, var(--down) 16%, transparent)"
                    : "transparent",
              }}
            >
              {change > 0 ? (
                <TrendingUp className="h-3 w-3" />
              ) : change < 0 ? (
                <TrendingDown className="h-3 w-3" />
              ) : (
                <Minus className="h-3 w-3" />
              )}
              {formatPriceChange(change)}
            </span>
          </div>

          {item.volume != null && (
            <p className="font-mono text-[10px] text-[var(--faint)]">
              Vol: {item.volume.toLocaleString()}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}
