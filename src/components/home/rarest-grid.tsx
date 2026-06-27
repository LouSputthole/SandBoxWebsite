import type { CSSProperties } from "react";
import Link from "next/link";
import { SkinTile } from "@/components/items/skin-tile";
import { Price } from "@/components/ui/price";
import { rarityCssColor } from "@/lib/rarity";
import type { HomeItem } from "./types";

/**
 * Rarest of the rare — three wide cards, each leading with a SkinTile and
 * ending in a big mono supply count ("IN EXISTENCE"). The tint + supply
 * number take the item's rarity color (accent fallback).
 */
export function RarestGrid({ items }: { items: HomeItem[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => {
        const rc = rarityCssColor(item.rarityColor) ?? "var(--accent)";
        return (
          <Link
            key={item.id}
            href={`/items/${item.slug}`}
            style={{ "--rc": rc } as CSSProperties}
            className="group relative flex items-center gap-4 overflow-hidden rounded-[18px] border border-line bg-panel p-3.5 transition-[transform,border-color] duration-150 hover:-translate-y-1 hover:[border-color:color-mix(in_srgb,var(--rc)_50%,var(--line))]"
          >
            <SkinTile
              imageUrl={item.imageUrl}
              name={item.name}
              type={item.type}
              rarityColor={rc}
              className="h-[56px] w-[56px] shrink-0"
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14.5px] font-bold text-tx">{item.name}</div>
              <div className="truncate text-[12px] capitalize text-faint">
                {item.type}
                {item.currentPrice != null && (
                  <>
                    {" · "}
                    <Price amount={item.currentPrice} />
                  </>
                )}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div
                className="font-mono text-[24px] font-bold leading-none"
                style={{ color: rc }}
              >
                {item.totalSupply != null ? item.totalSupply.toLocaleString() : "—"}
              </div>
              <div className="text-[10px] font-bold tracking-[.5px] text-faint">
                IN EXISTENCE
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
