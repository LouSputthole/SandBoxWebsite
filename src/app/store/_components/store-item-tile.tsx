import type { CSSProperties } from "react";
import Link from "next/link";
import { SkinTile } from "@/components/items/skin-tile";
import { Price } from "@/components/ui/price";
import { rarityCssColor } from "@/lib/rarity";

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
  rarityColor: string | null;
}

function effectiveStorePrice(item: StoreTileItem): number | null {
  return item.storePrice ?? item.releasePrice ?? null;
}

/**
 * "In the store now" tile — the 6-col card from the Arcade Store mockup: the
 * shared <SkinTile> frame with a corner STORE badge, the name, and the type +
 * Facepunch store price (null → "—"). Mirrors <ItemCard>'s hover lift and
 * rarity-tinted border, minus the watchlist/% chrome the store grid omits.
 */
export function StoreItemTile({ item }: { item: StoreTileItem }) {
  const rarityColor = rarityCssColor(item.rarityColor);
  const price = effectiveStorePrice(item);
  // Hover border brightens toward the item's rarity (or accent) color.
  const cardStyle = { "--rc": rarityColor ?? "var(--accent)" } as CSSProperties;

  return (
    <Link href={`/items/${item.slug}`}>
      <div
        style={cardStyle}
        className="group relative rounded-[18px] border border-line bg-panel p-3 transition-[transform,border-color] duration-150 hover:-translate-y-1 hover:[border-color:color-mix(in_srgb,var(--rc)_45%,var(--line))]"
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
        <div className="mt-[3px] flex items-baseline justify-between gap-2">
          <span className="text-[11px] capitalize text-faint">{item.type}</span>
          <Price
            amount={price}
            className="font-mono text-[13.5px] font-bold text-tx"
          />
        </div>
      </div>
    </Link>
  );
}
