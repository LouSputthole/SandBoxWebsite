"use client";

import Link from "next/link";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { SkinTile } from "@/components/items/skin-tile";
import { Price } from "@/components/ui/price";
import { rarityCssColor } from "@/lib/rarity";
import { formatPriceChange, cn } from "@/lib/utils";

interface Item {
  id: string;
  name: string;
  slug: string;
  type: string;
  imageUrl: string | null;
  currentPrice: number | null;
  lowestPrice: number | null;
  medianPrice: number | null;
  priceChange24h: number | null;
  volume: number | null;
  totalSupply: number | null;
  isLimited: boolean;
  rarityColor?: string | null;
}

interface ItemTableProps {
  items: Item[];
  /** Index offset of the first row — (page - 1) * pageSize — for the # column. */
  rankOffset: number;
  sort: string;
  onSortChange: (sort: string) => void;
}

interface SortableHeaderProps {
  label: string;
  sortKey: string;
  currentSort: string;
  onSort: (sort: string) => void;
  align?: "left" | "right";
}

/**
 * Click-to-sort header. First click sorts desc (asc for name), then toggles.
 * Active column = accent text + a lit caret; the inactive caret pair sits on
 * the hairline color.
 */
function SortableHeader({
  label,
  sortKey,
  currentSort,
  onSort,
  align = "left",
}: SortableHeaderProps) {
  const isAsc = currentSort === `${sortKey}-asc`;
  const isDesc = currentSort === `${sortKey}-desc`;
  const isActive = isAsc || isDesc;

  const handleClick = () => {
    if (isAsc) onSort(`${sortKey}-desc`);
    else if (isDesc) onSort(`${sortKey}-asc`);
    // Name reads best A→Z first; everything else (price/change/volume/supply)
    // is more useful big-first.
    else onSort(sortKey === "name" ? `${sortKey}-asc` : `${sortKey}-desc`);
  };

  return (
    <th
      scope="col"
      aria-sort={isAsc ? "ascending" : isDesc ? "descending" : "none"}
      className={cn(
        "select-none px-3 py-2.5 font-sans text-[11px] font-semibold uppercase tracking-wider transition-colors",
        align === "right" ? "text-right" : "text-left",
        isActive
          ? "text-[var(--accent)]"
          : "text-[var(--faint)] hover:text-[var(--tx)]"
      )}
    >
      <button
        type="button"
        onClick={handleClick}
        className={cn(
          "inline-flex cursor-pointer items-center gap-1 rounded transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]",
          align === "right" && "flex-row-reverse"
        )}
      >
        {label}
        <span className="inline-flex flex-col">
          <ChevronUp
            className={cn(
              "-mb-1 h-3 w-3",
              isAsc ? "text-[var(--accent)]" : "text-[var(--line)]"
            )}
          />
          <ChevronDown
            className={cn(
              "h-3 w-3",
              isDesc ? "text-[var(--accent)]" : "text-[var(--line)]"
            )}
          />
        </span>
      </button>
    </th>
  );
}

function ChangeCell({ value }: { value: number | null }) {
  const change = value ?? 0;
  const color =
    change > 0 ? "var(--up)" : change < 0 ? "var(--down)" : "var(--mut)";
  return (
    <td className="whitespace-nowrap px-3 py-2 text-right">
      <span
        className="inline-flex items-center justify-end gap-1 font-mono text-[13px] font-semibold"
        style={{ color }}
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
    </td>
  );
}

const dash = <span className="text-[var(--faint)]">—</span>;

/**
 * Dense, sortable Arcade table view of the catalog: rank, name, price, 24h %,
 * lowest, median, listings, supply. Mono numerics, hairline rows, hover lifts
 * the row to --bg2, click-to-sort headers with asc/desc carets. Reuses the
 * shared <SkinTile> frame + <Price> currency renderer so it matches the grid.
 */
export function ItemTable({ items, rankOffset, sort, onSortChange }: ItemTableProps) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="font-display text-lg font-bold text-[var(--tx)]">
          No skins found
        </p>
        <p className="mt-1 text-sm text-[var(--mut)]">
          Try a different search, type or sort.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-[14px] border border-[var(--line)] bg-[var(--panel)]">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-[var(--line)]">
            <th
              scope="col"
              className="w-12 px-3 py-2.5 text-center font-sans text-[11px] font-semibold uppercase tracking-wider text-[var(--faint)]"
            >
              #
            </th>
            <SortableHeader label="Name" sortKey="name" currentSort={sort} onSort={onSortChange} />
            <SortableHeader label="Price" sortKey="price" currentSort={sort} onSort={onSortChange} align="right" />
            <SortableHeader label="24h %" sortKey="change" currentSort={sort} onSort={onSortChange} align="right" />
            <th
              scope="col"
              className="px-3 py-2.5 text-right font-sans text-[11px] font-semibold uppercase tracking-wider text-[var(--faint)]"
            >
              Lowest
            </th>
            <th
              scope="col"
              className="px-3 py-2.5 text-right font-sans text-[11px] font-semibold uppercase tracking-wider text-[var(--faint)]"
            >
              Median
            </th>
            <SortableHeader label="Listings" sortKey="volume" currentSort={sort} onSort={onSortChange} align="right" />
            <SortableHeader label="Supply" sortKey="supply" currentSort={sort} onSort={onSortChange} align="right" />
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr
              key={item.id}
              className="border-b border-[var(--line2)] transition-colors last:border-0 hover:bg-[var(--bg2)]"
            >
              {/* Rank */}
              <td className="px-3 py-2 text-center font-mono text-xs text-[var(--faint)]">
                {rankOffset + i + 1}
              </td>

              {/* Name + tile */}
              <td className="px-3 py-2">
                <Link
                  href={`/items/${item.slug}`}
                  className="group flex items-center gap-3"
                >
                  <SkinTile
                    imageUrl={item.imageUrl}
                    name={item.name}
                    type={item.type}
                    rarityColor={rarityCssColor(item.rarityColor)}
                    iconSize="sm"
                    className="h-9 w-9 shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="truncate font-sans text-sm font-semibold text-[var(--tx)] group-hover:text-white">
                      {item.name}
                    </p>
                    <p className="text-[11px] capitalize text-[var(--faint)]">
                      {item.type}
                    </p>
                  </div>
                </Link>
              </td>

              {/* Price */}
              <td className="whitespace-nowrap px-3 py-2 text-right">
                <span className="font-mono text-sm font-bold text-[var(--tx)]">
                  {item.currentPrice != null ? <Price amount={item.currentPrice} /> : dash}
                </span>
              </td>

              {/* 24h % */}
              <ChangeCell value={item.priceChange24h} />

              {/* Lowest */}
              <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-[13px] text-[var(--mut)]">
                {item.lowestPrice != null ? <Price amount={item.lowestPrice} /> : dash}
              </td>

              {/* Median */}
              <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-[13px] text-[var(--mut)]">
                {item.medianPrice != null ? <Price amount={item.medianPrice} /> : dash}
              </td>

              {/* Listings */}
              <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-[13px] text-[var(--mut)]">
                {item.volume != null ? item.volume.toLocaleString() : dash}
              </td>

              {/* Supply */}
              <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-[13px] text-[var(--mut)]">
                {item.totalSupply != null ? item.totalSupply.toLocaleString() : dash}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
