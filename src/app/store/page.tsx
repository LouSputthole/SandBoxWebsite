import type { Metadata } from "next";
import { Clock, Infinity as InfinityIcon } from "lucide-react";
import { prisma } from "@/lib/db";
import { SectionHeader } from "@/components/home/section-header";
import { FreshDropsGrid } from "@/components/home/fresh-drops-grid";
import { StatCard } from "@/components/data";
import type { NewDropItem } from "@/components/items/new-drop-card";
import { StoreRotationBanner } from "./_components/store-rotation-banner";
import { StoreItemTile, type StoreTileItem } from "./_components/store-item-tile";

export const metadata: Metadata = {
  title: "S&box Store — what's in rotation right now",
  description:
    "Live view of the S&box in-game store. Rotating items with a countdown to delisting and the permanent catalog, each with its original store price next to the current Steam Market price and appreciation since release, plus the freshest skins just added to the tracker.",
  alternates: { canonical: "/store" },
  openGraph: {
    title: "S&box Store — current rotation + new drops",
    description:
      "Rotating store items with a delisting countdown and current market price, the permanent catalog, plus the newest S&box skins added to the tracker.",
  },
};

// Refresh on each request — `leavingStoreAt` countdowns and active-item flags
// change as the store rotates, and the "just added" badges should reflect the
// live backfill state. Cheap queries (~80 rows), so we don't cache.
export const dynamic = "force-dynamic";

// "Just added" mirrors the /new feed: newest items added in the last 30 days.
const JUST_ADDED_WINDOW_DAYS = 30;
const JUST_ADDED_LIMIT = 8;

// The store row is exactly the tile's data contract (rotation flags + prices +
// labels), so we render straight from it.
type StoreItem = StoreTileItem;

// Helper keeps Date.now() out of the data-flow body below.
function windowStart(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

// The current rotation ends when the soonest rotating (non-permanent, dated)
// item leaves. Returns an ISO string for the client countdown, or null when no
// rotating item carries a leaving date (sbox.dev sometimes omits it).
function rotationEndIso(items: StoreItem[]): string | null {
  const times = items
    .filter((i) => !i.isPermanentStoreItem && i.leavingStoreAt)
    .map((i) => i.leavingStoreAt!.getTime());
  if (times.length === 0) return null;
  return new Date(Math.min(...times)).toISOString();
}

function effectiveStorePrice(item: StoreItem): number {
  return item.storePrice ?? item.releasePrice ?? 0;
}

// Whole days until a leaving date, or null — used for the "leaving in 7d" stat.
function daysUntilDate(d: Date | null): number | null {
  if (!d) return null;
  const ms = d.getTime() - Date.now();
  if (ms <= 0) return 0;
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

export default async function StorePage() {
  const [storeRows, justAddedRows] = await Promise.all([
    prisma.item.findMany({
      where: { isActiveStoreItem: true },
      select: {
        id: true,
        name: true,
        slug: true,
        type: true,
        imageUrl: true,
        storePrice: true,
        releasePrice: true,
        currentPrice: true,
        rarityColor: true,
        isPermanentStoreItem: true,
        leavingStoreAt: true,
        category: true,
        itemDisplayName: true,
      },
    }),
    prisma.item.findMany({
      where: { createdAt: { gte: windowStart(JUST_ADDED_WINDOW_DAYS) } },
      orderBy: { createdAt: "desc" },
      take: JUST_ADDED_LIMIT,
      select: {
        id: true,
        name: true,
        slug: true,
        type: true,
        imageUrl: true,
        currentPrice: true,
        priceChange24h: true,
        volume: true,
        isLimited: true,
        createdAt: true,
        steamItemNameId: true,
      },
    }),
  ]);

  const storeItemsRaw = storeRows as StoreItem[];
  const justAdded = justAddedRows as NewDropItem[];

  // Rotating: not permanent (with or without a leaving date — sbox.dev sometimes
  // lacks the date but still flags isPermanent=false). Soonest to leave first,
  // then undated by name.
  const rotating = storeItemsRaw
    .filter((i) => !i.isPermanentStoreItem)
    .sort((a, b) => {
      const ad = a.leavingStoreAt?.getTime();
      const bd = b.leavingStoreAt?.getTime();
      if (ad != null && bd != null) return ad - bd;
      if (ad != null) return -1;
      if (bd != null) return 1;
      return a.name.localeCompare(b.name);
    });
  // Permanent: priciest first (by original store price), then by name.
  const permanent = storeItemsRaw
    .filter((i) => i.isPermanentStoreItem)
    .sort((a, b) => {
      const ap = effectiveStorePrice(a);
      const bp = effectiveStorePrice(b);
      if (ap !== bp) return bp - ap;
      return a.name.localeCompare(b.name);
    });

  const leavingIn7d = rotating.filter((i) => {
    const d = daysUntilDate(i.leavingStoreAt);
    return d != null && d <= 7;
  }).length;

  const endsAt = rotationEndIso(storeItemsRaw);

  const storeGrid = "grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5";

  return (
    <div className="mx-auto max-w-[1240px] px-6 py-8">
      {/* Header */}
      <header className="mb-7">
        <h1 className="font-display text-[38px] font-extrabold leading-tight tracking-[-.02em] text-tx">
          Store &amp; new drops
        </h1>
        <p className="mt-2 text-[14.5px] text-mut">
          What&apos;s live in the in-game store right now — rotating items leave
          on a schedule, permanent items stay forever — with each item&apos;s
          original store price next to its current market price.
        </p>
      </header>

      {/* Store-rotation banner with live countdown */}
      <StoreRotationBanner endsAt={endsAt} itemCount={storeItemsRaw.length} />

      {/* Stats strip */}
      <div className="mb-9 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Rotating" value={rotating.length.toLocaleString()} />
        <StatCard label="Permanent" value={permanent.length.toLocaleString()} />
        <StatCard
          label="Leaving in 7d"
          value={leavingIn7d.toLocaleString()}
        />
        <StatCard
          label="Total active"
          value={storeItemsRaw.length.toLocaleString()}
        />
      </div>

      {/* Rotating now */}
      <SectionHeader
        title="Rotating now"
        subtitle="Sorted by leaving date — once an item rotates out, the only way to get one is the secondary market."
        icon={<Clock className="h-7 w-7 text-accent" />}
      />
      {rotating.length === 0 ? (
        <p className="mb-9 text-sm text-mut">Nothing in rotation right now.</p>
      ) : (
        <div className={`mb-9 ${storeGrid}`}>
          {rotating.map((item) => (
            <StoreItemTile key={item.id} item={item} />
          ))}
        </div>
      )}

      {/* Permanent store */}
      <SectionHeader
        title="Permanent store"
        subtitle="Always purchasable — these never rotate out."
        icon={<InfinityIcon className="h-7 w-7 text-accent" />}
      />
      {permanent.length === 0 ? (
        <p className="mb-9 text-sm text-mut">No permanent items flagged yet.</p>
      ) : (
        <div className={`mb-9 ${storeGrid}`}>
          {permanent.map((item) => (
            <StoreItemTile key={item.id} item={item} />
          ))}
        </div>
      )}

      {/* Just added */}
      <SectionHeader
        title="Just added"
        subtitle="Freshly tracked skins — prices sync within a few hours of listing."
      />
      {justAdded.length === 0 ? (
        <p className="text-sm text-mut">
          No new skins added in the last {JUST_ADDED_WINDOW_DAYS} days.
        </p>
      ) : (
        <FreshDropsGrid items={justAdded} />
      )}
    </div>
  );
}
