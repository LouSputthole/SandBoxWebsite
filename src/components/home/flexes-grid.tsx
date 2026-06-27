import type { CSSProperties } from "react";
import Link from "next/link";
import { SkinTile } from "@/components/items/skin-tile";
import { Price } from "@/components/ui/price";
import { rarityCssColor } from "@/lib/rarity";
import type { HomeItem } from "./types";

/**
 * Biggest flexes — the most valuable skins, six across. Each is a SkinTile
 * with a low-supply "x left" scarcity chip, the name, and a big mono price.
 */
export function FlexesGrid({ items }: { items: HomeItem[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
      {items.map((item) => {
        const rc = rarityCssColor(item.rarityColor);
        const hasSupply = item.totalSupply != null && item.totalSupply > 0;
        return (
          <Link
            key={item.id}
            href={`/items/${item.slug}`}
            style={{ "--rc": rc ?? "var(--accent)" } as CSSProperties}
            className="group rounded-[18px] border border-line bg-panel p-3 transition-[transform,border-color] duration-150 hover:-translate-y-1 hover:[border-color:color-mix(in_srgb,var(--rc)_50%,var(--line))]"
          >
            <SkinTile
              imageUrl={item.imageUrl}
              name={item.name}
              type={item.type}
              rarityColor={rc}
              iconSize="lg"
              className="mb-3"
              badge={
                hasSupply ? (
                  <span
                    className="rounded-[7px] px-1.5 py-0.5 font-mono text-[10px] font-bold text-mut backdrop-blur"
                    style={{ background: "rgba(14,13,19,.7)" }}
                  >
                    {item.totalSupply!.toLocaleString()} left
                  </span>
                ) : undefined
              }
            />
            <div className="truncate text-[13.5px] font-bold text-tx">{item.name}</div>
            <div className="mt-0.5 font-mono text-[15px] font-bold text-tx">
              {item.currentPrice != null ? (
                <Price amount={item.currentPrice} />
              ) : (
                <span className="text-faint">N/A</span>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
