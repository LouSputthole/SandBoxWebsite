import type { CSSProperties } from "react";
import Link from "next/link";
import { TrendingUp, TrendingDown } from "lucide-react";
import { SkinTile } from "@/components/items/skin-tile";
import { Price } from "@/components/ui/price";
import { rarityCssColor } from "@/lib/rarity";
import { ItemLeavingCountdown } from "./rotation-countdown";
import { daysUntil } from "./format-remaining";

export interface StoreTileItem {
  id: string;
  name: string;
  slug: string;
  type: string;
  imageUrl: string | null;
  // Both columns hold the same "original store price" concept: storePrice from
  // the legacy sbox.game scraper, releasePrice from sbox.dev. Coalesce so a
  // stale row still renders a price.
  storePrice: number | null;
  releasePrice: number | null;
  // Live Steam Market price — the headline value next to the store price; its
  // delta to the store price is the "appreciation since release".
  currentPrice: number | null;
  rarityColor: string | null;
  // Rotation flags: permanent items never leave; rotating ones carry a leaving
  // date when sbox.dev provides one (it sometimes omits it).
  isPermanentStoreItem: boolean;
  leavingStoreAt: Date | null;
  // sbox.dev descriptive labels, when present.
  category: string | null;
  itemDisplayName: string | null;
}

function effectiveStorePrice(item: StoreTileItem): number | null {
  return item.storePrice ?? item.releasePrice ?? null;
}

/**
 * "In the store now" tile — the Arcade Store card: the shared <SkinTile> frame
 * with a corner STORE badge, the name + category/tier subline, the Facepunch
 * store price next to the live Steam Market price with its appreciation delta,
 * and (for rotating items) a delisting countdown. Mirrors <ItemCard>'s hover
 * lift and rarity-tinted border. Null prices render "—".
 */
export function StoreItemTile({ item }: { item: StoreTileItem }) {
  const rarityColor = rarityCssColor(item.rarityColor);
  const store = effectiveStorePrice(item);
  const market = item.currentPrice;
  // Appreciation since release: market vs original store price, in percent.
  // Only meaningful when we have both a market price and a positive store price.
  const delta =
    market != null && store != null && store > 0
      ? ((market - store) / store) * 100
      : null;
  const Trend = delta != null && delta >= 0 ? TrendingUp : TrendingDown;

  // Hover border brightens toward the item's rarity (or accent) color.
  const cardStyle = { "--rc": rarityColor ?? "var(--accent)" } as CSSProperties;

  return (
    <Link href={`/items/${item.slug}`}>
      <div
        style={cardStyle}
        className="group relative flex h-full flex-col rounded-[18px] border border-line bg-panel p-3 transition-[transform,border-color] duration-150 hover:-translate-y-1 hover:[border-color:color-mix(in_srgb,var(--rc)_45%,var(--line))]"
      >
        <div className="relative mb-[11px]">
          <SkinTile
            imageUrl={item.imageUrl}
            name={item.name}
            type={item.type}
            rarityColor={rarityColor}
            iconSize="lg"
            className="!rounded-[13px]"
          />
          <span
            className="absolute left-2 top-2 z-10 rounded-[6px] border px-[7px] py-0.5 text-[9.5px] font-extrabold uppercase tracking-[.4px] text-accent backdrop-blur-[6px]"
            style={{
              background: "rgba(14, 13, 19, 0.7)",
              borderColor: "color-mix(in srgb, var(--accent) 40%, transparent)",
            }}
          >
            Store
          </span>
        </div>

        <h3 className="truncate font-sans text-[13px] font-bold text-tx">
          {item.name}
        </h3>

        {/* Subline: broad category (or type) + optional tier/display-name badge */}
        <div className="mt-[3px] flex items-center justify-between gap-2">
          <span className="truncate text-[11px] capitalize text-faint">
            {item.category ?? item.type}
          </span>
          {item.itemDisplayName && (
            <span className="shrink-0 text-[9.5px] font-semibold uppercase tracking-[.4px] text-mut">
              {item.itemDisplayName}
            </span>
          )}
        </div>

        {/* Prices: original store price + live market price with appreciation */}
        <div className="mt-2.5 space-y-1 border-t border-line2 pt-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[10px] uppercase tracking-[.4px] text-faint">
              Store
            </span>
            <Price
              amount={store}
              className="font-mono text-[12.5px] font-bold text-mut"
            />
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[10px] uppercase tracking-[.4px] text-faint">
              Market
            </span>
            <span className="flex items-baseline gap-1.5">
              {delta != null && Math.abs(delta) >= 0.5 && (
                <span
                  className="inline-flex items-center gap-0.5 font-mono text-[10.5px] font-bold tabular-nums"
                  style={{ color: delta >= 0 ? "var(--up)" : "var(--down)" }}
                >
                  <Trend className="h-3 w-3" />
                  {delta >= 0 ? "+" : ""}
                  {delta.toFixed(0)}%
                </span>
              )}
              <Price
                amount={market}
                className="font-mono text-[13.5px] font-bold text-tx"
              />
            </span>
          </div>
        </div>

        {/* Delisting countdown — rotating items only */}
        {!item.isPermanentStoreItem && (
          <div className="mt-2">
            <ItemLeavingCountdown
              endsAt={item.leavingStoreAt ? item.leavingStoreAt.toISOString() : null}
              initialDays={daysUntil(
                item.leavingStoreAt ? item.leavingStoreAt.toISOString() : null
              )}
            />
          </div>
        )}
      </div>
    </Link>
  );
}
