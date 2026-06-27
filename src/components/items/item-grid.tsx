"use client";

import { ItemCard } from "./item-card";

interface Item {
  id: string;
  name: string;
  slug: string;
  type: string;
  imageUrl: string | null;
  currentPrice: number | null;
  priceChange24h: number | null;
  volume: number | null;
  isLimited: boolean;
  rarityColor?: string | null;
}

interface ItemGridProps {
  items: Item[];
}

/**
 * Arcade responsive skin grid — a thin wrapper around <ItemCard>. The count,
 * sort/filter chips and "Load more" live in the page (items-browser); this
 * just lays the cards out (~5 columns on desktop) and renders the empty state.
 */
export function ItemGrid({ items }: ItemGridProps) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="font-display text-lg font-bold text-[var(--tx)]">No skins found</p>
        <p className="mt-1 text-sm text-[var(--mut)]">
          Try a different search, type or sort.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {items.map((item) => (
        <ItemCard key={item.id} item={item} />
      ))}
    </div>
  );
}
