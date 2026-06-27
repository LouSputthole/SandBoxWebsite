import Link from "next/link";
import { SkinTile } from "@/components/items/skin-tile";
import type { NewDropItem } from "@/components/items/new-drop-card";

function addedLabel(createdAt: Date): string {
  const ms = Date.now() - createdAt.getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days <= 0) {
    const hours = Math.floor(ms / 3_600_000);
    return hours <= 0 ? "just now" : `${hours}h ago`;
  }
  if (days === 1) return "1d ago";
  return `${days}d ago`;
}

// A brand-new drop populates in stages: a Steam link + price first, then the
// item_nameid that unlocks the order book. Surface that so a fresh drop reads
// as "still syncing" rather than broken. Mirrors NewDropCard's logic.
function dataStatus(item: NewDropItem): string | null {
  if (item.currentPrice == null) return "prices syncing";
  if (item.steamItemNameId == null) return "order book pending";
  return null;
}

/**
 * Fresh drops — compact horizontal cards (SkinTile + name + "added Xd ago" +
 * sync status) with a corner NEW badge. Wired to the homepage's newest-items
 * (last 30 days) feed.
 */
export function FreshDropsGrid({ items }: { items: NewDropItem[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => {
        const status = dataStatus(item);
        return (
          <Link
            key={item.id}
            href={`/items/${item.slug}`}
            className="group relative flex items-center gap-3 rounded-[18px] border border-line bg-panel p-3 transition-[transform,border-color] duration-150 hover:-translate-y-1 hover:[border-color:color-mix(in_srgb,var(--accent)_45%,var(--line))]"
          >
            <span
              className="absolute right-3 top-3 rounded-[6px] px-1.5 py-0.5 font-mono text-[9.5px] font-bold tracking-[.5px] text-accent"
              style={{ background: "color-mix(in srgb, var(--accent) 16%, transparent)" }}
            >
              NEW
            </span>
            <SkinTile
              imageUrl={item.imageUrl}
              name={item.name}
              type={item.type}
              className="h-[50px] w-[50px] shrink-0 !rounded-[13px]"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate pr-9 text-[13.5px] font-bold text-tx">
                {item.name}
              </span>
              <span className="block text-[11.5px] text-faint">
                added {addedLabel(item.createdAt)}
              </span>
              {status && (
                <span className="mt-0.5 block text-[11.5px] text-mut">{status}</span>
              )}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
