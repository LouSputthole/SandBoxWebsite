"use client";

import Link from "next/link";
import { TrendingUp, TrendingDown, Minus, ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { ItemImage } from "@/components/items/item-image";
import { Button } from "@/components/ui/button";
import { formatPrice, formatPriceChange } from "@/lib/utils";

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
  isLimited: boolean;
}

interface ItemTableProps {
  items: Item[];
  page: number;
  totalPages: number;
  total: number;
  sort: string;
  onPageChange: (page: number) => void;
  onSortChange: (sort: string) => void;
}

interface SortableHeaderProps {
  label: string;
  sortKey: string;
  currentSort: string;
  onSort: (sort: string) => void;
  align?: "left" | "right";
}

function SortableHeader({ label, sortKey, currentSort, onSort, align = "left" }: SortableHeaderProps) {
  const isAsc = currentSort === `${sortKey}-asc`;
  const isDesc = currentSort === `${sortKey}-desc`;
  const isActive = isAsc || isDesc;

  const handleClick = () => {
    if (isAsc) {
      onSort(`${sortKey}-desc`);
    } else if (isDesc) {
      onSort(`${sortKey}-asc`);
    } else {
      // Default: price/change/volume sort desc first, name sorts asc first
      onSort(sortKey === "name" ? `${sortKey}-asc` : `${sortKey}-desc`);
    }
  };

  return (
    <th
      className={`px-3 py-3 text-xs font-medium uppercase tracking-wider cursor-pointer select-none hover:text-white transition-colors ${
        align === "right" ? "text-right" : "text-left"
      } ${isActive ? "text-purple-400" : "text-neutral-500"}`}
      onClick={handleClick}
    >
      <span className="inline-flex items-center gap-1">
        {align === "right" && (
          <span className="inline-flex flex-col">
            <ChevronUp className={`h-3 w-3 -mb-1 ${isAsc ? "text-purple-400" : "text-neutral-700"}`} />
            <ChevronDown className={`h-3 w-3 ${isDesc ? "text-purple-400" : "text-neutral-700"}`} />
          </span>
        )}
        {label}
        {align !== "right" && (
          <span className="inline-flex flex-col">
            <ChevronUp className={`h-3 w-3 -mb-1 ${isAsc ? "text-purple-400" : "text-neutral-700"}`} />
            <ChevronDown className={`h-3 w-3 ${isDesc ? "text-purple-400" : "text-neutral-700"}`} />
          </span>
        )}
      </span>
    </th>
  );
}

function ChangeCell({ value }: { value: number | null }) {
  const change = value ?? 0;
  return (
    <td className="px-3 py-3 text-right whitespace-nowrap">
      <div className="inline-flex items-center gap-1">
        {change > 0 ? (
          <TrendingUp className="h-3 w-3 text-emerald-400" />
        ) : change < 0 ? (
          <TrendingDown className="h-3 w-3 text-red-400" />
        ) : (
          <Minus className="h-3 w-3 text-neutral-600" />
        )}
        <span
          className={`text-sm font-medium ${
            change > 0 ? "text-emerald-400" : change < 0 ? "text-red-400" : "text-neutral-500"
          }`}
        >
          {formatPriceChange(change)}
        </span>
      </div>
    </td>
  );
}

export function ItemTable({ items, page, totalPages, total, sort, onPageChange, onSortChange }: ItemTableProps) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-neutral-500">
        <p className="text-lg">No items found</p>
        <p className="text-sm mt-1">Try adjusting your search or filters</p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm text-neutral-500 mb-4">
        {total} item{total !== 1 ? "s" : ""} found
      </p>

      <div className="overflow-x-auto rounded-xl border border-neutral-800 bg-neutral-900/30">
        <table className="w-full">
          <thead className="border-b border-neutral-800 bg-neutral-900/50">
            <tr>
              <th className="w-10 px-3 py-3 text-xs font-medium text-neutral-500 text-center">#</th>
              <SortableHeader label="Item" sortKey="name" currentSort={sort} onSort={onSortChange} />
              <SortableHeader label="Price" sortKey="price" currentSort={sort} onSort={onSortChange} align="right" />
              <SortableHeader label="24h %" sortKey="change" currentSort={sort} onSort={onSortChange} align="right" />
              <th className="px-3 py-3 text-xs font-medium text-neutral-500 text-right uppercase tracking-wider">Lowest</th>
              <th className="px-3 py-3 text-xs font-medium text-neutral-500 text-right uppercase tracking-wider">Median</th>
              <SortableHeader label="Listings" sortKey="volume" currentSort={sort} onSort={onSortChange} align="right" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800/50">
            {items.map((item, i) => (
              <tr
                key={item.id}
                className="hover:bg-neutral-800/30 transition-colors"
              >
                {/* Rank */}
                <td className="px-3 py-3 text-center text-xs text-neutral-600">
                  {(page - 1) * items.length + i + 1}
                </td>

                {/* Item name + image */}
                <td className="px-3 py-3">
                  <Link href={`/items/${item.slug}`} className="flex items-center gap-3 group">
                    <ItemImage
                      src={item.imageUrl}
                      name={item.name}
                      type={item.type}
                      size="sm"
                      className="h-10 w-10 rounded-lg border border-neutral-700/50 shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-neutral-100 group-hover:text-white truncate">
                        {item.name}
                      </p>
                      <p className="text-[10px] text-neutral-500 capitalize">{item.type}</p>
                    </div>
                  </Link>
                </td>

                {/* Price */}
                <td className="px-3 py-3 text-right whitespace-nowrap">
                  <span className="text-sm font-semibold text-white">
                    {item.currentPrice != null ? formatPrice(item.currentPrice) : "—"}
                  </span>
                </td>

                {/* 24h Change */}
                <ChangeCell value={item.priceChange24h} />

                {/* Lowest */}
                <td className="px-3 py-3 text-right whitespace-nowrap text-sm text-neutral-400">
                  {item.lowestPrice != null ? formatPrice(item.lowestPrice) : "—"}
                </td>

                {/* Median */}
                <td className="px-3 py-3 text-right whitespace-nowrap text-sm text-neutral-400">
                  {item.medianPrice != null ? formatPrice(item.medianPrice) : "—"}
                </td>

                {/* Listings */}
                <td className="px-3 py-3 text-right whitespace-nowrap text-sm text-neutral-400">
                  {item.volume != null ? item.volume.toLocaleString() : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-neutral-400 px-4">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
