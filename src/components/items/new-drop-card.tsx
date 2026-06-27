import { Clock } from "lucide-react";
import { ItemCard } from "@/components/items/item-card";

export interface NewDropItem {
  id: string;
  name: string;
  slug: string;
  type: string;
  imageUrl: string | null;
  currentPrice: number | null;
  priceChange24h: number | null;
  volume: number | null;
  isLimited: boolean;
  createdAt: Date;
  steamItemNameId: string | null;
  // Steam-sourced rarity tint (hex, no leading #), when graded. Flows into
  // <ItemCard> (/new) and <SkinTile> (homepage fresh drops) for the frame tint.
  rarityColor?: string | null;
}

function daysSince(createdAt: Date): number {
  return Math.floor((Date.now() - createdAt.getTime()) / 86_400_000);
}

function addedLabel(createdAt: Date): string {
  const ms = Date.now() - createdAt.getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days <= 0) {
    const hours = Math.floor(ms / 3_600_000);
    return hours <= 0 ? "just now" : `${hours}h ago`;
  }
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

// A brand-new drop populates in stages: first a Steam Market link + price,
// then the item_nameid that unlocks the buy/sell order book. Surface that so
// a fresh drop reads as "still syncing" rather than broken.
function dataStatus(item: NewDropItem): string | null {
  if (item.currentPrice == null) return "prices syncing";
  if (item.steamItemNameId == null) return "order book pending";
  return null;
}

export function NewDropCard({ item }: { item: NewDropItem }) {
  const isNew = daysSince(item.createdAt) <= 7;
  const status = dataStatus(item);

  return (
    <div>
      <ItemCard item={item} />
      <div className="mt-1.5 flex items-center justify-between gap-2 px-1">
        <span className="flex items-center gap-1 text-[10px] text-neutral-500">
          <Clock className="h-3 w-3" />
          added {addedLabel(item.createdAt)}
        </span>
        {isNew ? (
          <span className="rounded-full bg-purple-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-purple-300">
            New
          </span>
        ) : null}
      </div>
      {status ? (
        <div className="mt-1 px-1">
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-medium text-amber-300/90">
            <span className="h-1 w-1 rounded-full bg-amber-400 animate-pulse" />
            {status}
          </span>
        </div>
      ) : null}
    </div>
  );
}
