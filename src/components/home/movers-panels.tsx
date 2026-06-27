import Link from "next/link";
import { TrendingUp, TrendingDown, type LucideIcon } from "lucide-react";
import { SkinTile } from "@/components/items/skin-tile";
import { Price } from "@/components/ui/price";
import { rarityCssColor } from "@/lib/rarity";
import { formatPriceChange } from "@/lib/utils";
import type { HomeItem } from "./types";

function MoverRow({ item }: { item: HomeItem }) {
  const change = item.priceChange24h ?? 0;
  const up = change > 0;
  const down = change < 0;
  const rc = rarityCssColor(item.rarityColor);
  const color = up ? "var(--up)" : down ? "var(--down)" : "var(--mut)";
  const arrow = up ? "▲" : down ? "▼" : "·";

  return (
    <Link
      href={`/items/${item.slug}`}
      className="flex items-center gap-3 rounded-[13px] px-2 py-2.5 transition-colors hover:bg-bg2"
    >
      <SkinTile
        imageUrl={item.imageUrl}
        name={item.name}
        type={item.type}
        rarityColor={rc}
        className="h-[46px] w-[46px] shrink-0 !rounded-[12px]"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14.5px] font-bold text-tx">
          {item.name}
        </span>
        <span className="text-[12px] capitalize text-faint">{item.type}</span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block font-mono text-[14px] font-bold text-tx">
          {item.currentPrice != null ? <Price amount={item.currentPrice} /> : "—"}
        </span>
        <span className="font-mono text-[12px] font-bold" style={{ color }}>
          {arrow} {formatPriceChange(change)}
        </span>
      </span>
    </Link>
  );
}

function Panel({
  title,
  color,
  Icon,
  items,
}: {
  title: string;
  color: string;
  Icon: LucideIcon;
  items: HomeItem[];
}) {
  return (
    <div className="rounded-[20px] border border-line bg-panel p-4">
      <div className="mb-3 flex items-center gap-2.5">
        <span
          className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-[9px]"
          style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}
        >
          <Icon className="h-[17px] w-[17px]" />
        </span>
        <h3 className="font-display text-[17px] font-bold" style={{ color }}>
          {title}
        </h3>
      </div>
      <div>
        {items.map((item) => (
          <MoverRow key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}

/**
 * Biggest movers — gainers / losers split panels. Up/down color is reserved
 * for price signals only, per the Arcade discipline.
 */
export function MoversPanels({
  gainers,
  losers,
}: {
  gainers: HomeItem[];
  losers: HomeItem[];
}) {
  return (
    <div className="grid grid-cols-1 gap-[18px] lg:grid-cols-2">
      <Panel title="Top gainers" color="var(--up)" Icon={TrendingUp} items={gainers} />
      <Panel title="Top losers" color="var(--down)" Icon={TrendingDown} items={losers} />
    </div>
  );
}
