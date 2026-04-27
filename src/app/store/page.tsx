import type { Metadata } from "next";
import Link from "next/link";
import {
  Store,
  Clock,
  Infinity as InfinityIcon,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { prisma } from "@/lib/db";
import { ItemImage } from "@/components/items/item-image";
import { formatPrice } from "@/lib/utils";

export const metadata: Metadata = {
  title: "S&box Store — what's in rotation right now",
  description:
    "Live view of the S&box in-game store. Rotating items with countdown to delisting, plus the permanent catalog. Includes current Steam Market price next to the original store price so you can see where each item trades.",
  alternates: { canonical: "/store" },
  openGraph: {
    title: "S&box Store — current rotation + permanent items",
    description:
      "Rotating store items with delisting countdown plus the permanent S&box catalog.",
  },
};

// Refresh on each request — `leavingStoreAt` countdowns and active-item
// flags can change as the store rotates. Cheap query (~80 rows), so
// we don't bother caching.
export const dynamic = "force-dynamic";

interface StoreItem {
  id: string;
  name: string;
  slug: string;
  type: string;
  imageUrl: string | null;
  storePrice: number | null;
  currentPrice: number | null;
  leavingStoreAt: Date | null;
  isPermanentStoreItem: boolean;
  category: string | null;
  itemDisplayName: string | null;
}

function daysUntil(d: Date | null): number | null {
  if (!d) return null;
  const ms = d.getTime() - Date.now();
  if (ms <= 0) return 0;
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

export default async function StorePage() {
  const items = (await prisma.item.findMany({
    where: { isActiveStoreItem: true },
    select: {
      id: true,
      name: true,
      slug: true,
      type: true,
      imageUrl: true,
      storePrice: true,
      currentPrice: true,
      leavingStoreAt: true,
      isPermanentStoreItem: true,
      category: true,
      itemDisplayName: true,
    },
  })) as StoreItem[];

  // Rotating: not permanent (whether or not we have a leavingStoreAt —
  // sbox.dev sometimes lacks the date but still flags isPermanent=false).
  // Sort: items with a known leaving date come first (closest first),
  // then items with unknown dates by name.
  const rotating = items
    .filter((i) => !i.isPermanentStoreItem)
    .sort((a, b) => {
      const ad = a.leavingStoreAt?.getTime();
      const bd = b.leavingStoreAt?.getTime();
      if (ad != null && bd != null) return ad - bd;
      if (ad != null) return -1;
      if (bd != null) return 1;
      return a.name.localeCompare(b.name);
    });

  const permanent = items
    .filter((i) => i.isPermanentStoreItem)
    .sort((a, b) => {
      const ap = a.storePrice ?? 0;
      const bp = b.storePrice ?? 0;
      if (ap !== bp) return bp - ap;
      return a.name.localeCompare(b.name);
    });

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <Store className="h-5 w-5 text-purple-400" />
          <h1 className="text-2xl font-bold text-white">S&box Store</h1>
        </div>
        <p className="text-sm text-neutral-400 max-w-2xl leading-relaxed">
          What&apos;s currently purchasable in-game. Rotating items leave the
          store on a schedule — once they&apos;re gone, the only way to get one
          is the secondary market. Permanent items stay forever.
        </p>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-8">
        <Stat label="Rotating" value={rotating.length.toLocaleString()} />
        <Stat label="Permanent" value={permanent.length.toLocaleString()} />
        <Stat
          label="Leaving in 7d"
          value={rotating
            .filter((i) => {
              const d = daysUntil(i.leavingStoreAt);
              return d != null && d <= 7;
            })
            .length.toLocaleString()}
          tone="amber"
        />
        <Stat
          label="Total active"
          value={items.length.toLocaleString()}
        />
      </div>

      {/* Rotating section */}
      <section className="mb-10">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="h-4 w-4 text-amber-400" />
          <h2 className="text-base font-semibold text-white">
            Rotating now
          </h2>
          <span className="text-xs text-neutral-500">
            sorted by leaving date
          </span>
        </div>
        {rotating.length === 0 ? (
          <p className="text-sm text-neutral-500 italic">
            Nothing in rotation right now.
          </p>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {rotating.map((item) => (
              <StoreCard key={item.id} item={item} />
            ))}
          </ul>
        )}
      </section>

      {/* Permanent section */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <InfinityIcon className="h-4 w-4 text-emerald-400" />
          <h2 className="text-base font-semibold text-white">Permanent</h2>
          <span className="text-xs text-neutral-500">
            never rotates out
          </span>
        </div>
        {permanent.length === 0 ? (
          <p className="text-sm text-neutral-500 italic">
            No permanent items flagged yet.
          </p>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {permanent.map((item) => (
              <StoreCard key={item.id} item={item} />
            ))}
          </ul>
        )}
      </section>

      <p className="text-[11px] text-neutral-600 mt-10 leading-relaxed">
        Store data refreshes daily from sbox.dev. Market prices come from
        Steam Community Market — the delta to original store price tells
        you whether an item has appreciated since release.
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "amber";
}) {
  const toneClass =
    tone === "amber"
      ? "text-amber-300"
      : "text-white";
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-neutral-500">
        {label}
      </div>
      <div className={`text-lg font-bold tabular-nums ${toneClass}`}>
        {value}
      </div>
    </div>
  );
}

function StoreCard({ item }: { item: StoreItem }) {
  const left = daysUntil(item.leavingStoreAt);
  const market = item.currentPrice;
  const store = item.storePrice;
  const delta =
    market != null && store != null && store > 0
      ? ((market - store) / store) * 100
      : null;
  const Trend = delta != null && delta >= 0 ? TrendingUp : TrendingDown;
  const deltaTone =
    delta == null
      ? "text-neutral-500"
      : delta >= 0
        ? "text-emerald-300"
        : "text-red-300";

  // Time-left tone: red <=2d, amber <=7d, neutral otherwise.
  const leftTone =
    left == null
      ? "text-neutral-500"
      : left <= 2
        ? "text-red-300"
        : left <= 7
          ? "text-amber-300"
          : "text-neutral-400";

  return (
    <li>
      <Link
        href={`/items/${item.slug}`}
        className="group flex gap-3 rounded-lg border border-neutral-800 bg-neutral-900/40 p-3 hover:border-purple-500/40 hover:bg-neutral-900/80 transition"
      >
        <div className="h-14 w-14 rounded-md border border-neutral-700 overflow-hidden shrink-0 bg-neutral-950">
          <ItemImage
            src={item.imageUrl}
            name={item.name}
            type={item.type}
            size="sm"
            className="h-full w-full"
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-white truncate group-hover:text-purple-300 transition-colors">
              {item.name}
            </p>
            {item.itemDisplayName && (
              <span className="text-[10px] uppercase tracking-wider text-neutral-500 shrink-0">
                {item.itemDisplayName}
              </span>
            )}
          </div>
          <p className="text-[11px] text-neutral-500 capitalize">
            {item.category ?? item.type}
          </p>
          <div className="flex items-center justify-between gap-2 mt-1.5">
            <div className="text-xs">
              <span className="text-neutral-500">Store </span>
              <span className="text-neutral-200 tabular-nums">
                {store != null ? formatPrice(store) : "—"}
              </span>
              {market != null && (
                <>
                  <span className="text-neutral-600 mx-1">·</span>
                  <span className="text-neutral-500">Market </span>
                  <span className="text-neutral-100 tabular-nums">
                    {formatPrice(market)}
                  </span>
                </>
              )}
            </div>
            {delta != null && Math.abs(delta) >= 0.5 && (
              <span
                className={`inline-flex items-center gap-0.5 text-[11px] font-semibold tabular-nums ${deltaTone}`}
              >
                <Trend className="h-3 w-3" />
                {delta >= 0 ? "+" : ""}
                {delta.toFixed(0)}%
              </span>
            )}
          </div>
          {!item.isPermanentStoreItem && (
            <div
              className={`mt-1 text-[11px] inline-flex items-center gap-1 ${leftTone}`}
            >
              <Clock className="h-3 w-3" />
              {left == null
                ? "Leaving date unknown"
                : left === 0
                  ? "Leaving today"
                  : left === 1
                    ? "1 day left"
                    : `${left} days left`}
            </div>
          )}
        </div>
      </Link>
    </li>
  );
}
