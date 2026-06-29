"use client";

import * as React from "react";
import Link from "next/link";
import {
  Heart,
  Plus,
  Bell,
  X,
  ArrowUp,
  ArrowDown,
  Trash2,
  TrendingUp,
  TrendingDown,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
} from "lucide-react";
import { useWatchlist } from "@/lib/watchlist/context";
import { useAuth } from "@/lib/auth/context";
import { StatCard, RankedTable, type RankedColumn } from "@/components/data";
import { Sparkline } from "@/components/charts";
import { SkinTile } from "@/components/items/skin-tile";
import { Button } from "@/components/ui/button";
import { Price } from "@/components/ui/price";
import { cn, formatPriceChange } from "@/lib/utils";
import { rarityCssColor } from "@/lib/rarity";

/**
 * Arcade-redesign watchlist ("/portfolio"). Restyle of the prior PortfolioView:
 * same real data + behavior (slug-keyed watchlist from WatchlistProvider, POST
 * /api/portfolio for prices, per-row remove via `toggle`, bulk wipe via
 * `clear`), rebuilt to the design mockup — header + "Clear all" / "Add skins"
 * CTAs, six StatCard summaries (tracked value, 24h, avg price, gainers, losers,
 * count), and a RankedTable of tracked skins with SkinTile, click-to-sort column
 * headers, a Listings/volume column, mono numerics, a 7d sparkline, a price-alert
 * affordance, and an × remove button.
 *
 * The table lives in this client subtree because RankedTable's `cell` props
 * are functions (can't cross the server boundary) and the rows carry click
 * handlers + sort state.
 */

interface PortfolioItem {
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
  storeStatus: string;
  rarityColor: string | null;
  /** Real last-30d price series (even-thinned, ≤24 pts) from /api/portfolio. */
  spark30d: number[];
  /** The signed-in user's active alert on this item, if any (drives "% away"). */
  alert: { targetPrice: number; direction: string } | null;
}

interface PortfolioData {
  items: PortfolioItem[];
  totalValue: number;
  totalChange: number;
  itemCount: number;
  gainers: number;
  losers: number;
}

/** Which column the table is sorted by. */
type SortKey = "name" | "price" | "change" | "volume";

/** Up/down/neutral color used for delta text and the inline sparkline. */
function deltaColor(change: number | null | undefined): string {
  if (change == null || change === 0) return "var(--mut)";
  return change > 0 ? "var(--up)" : "var(--down)";
}

/** Value-weighted blended 24h move across the tracked skins. */
function blendedChange(items: PortfolioItem[]): number {
  let weighted = 0;
  let base = 0;
  for (const it of items) {
    const p = it.currentPrice ?? 0;
    if (p <= 0) continue;
    weighted += p * (it.priceChange24h ?? 0);
    base += p;
  }
  return base > 0 ? weighted / base : 0;
}

export function WatchlistView() {
  const { watchlist, toggle, clear } = useWatchlist();
  const { user, login } = useAuth();
  const [data, setData] = React.useState<PortfolioData | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [sortKey, setSortKey] = React.useState<SortKey>("price");
  const [sortAsc, setSortAsc] = React.useState(false);

  React.useEffect(() => {
    if (watchlist.length === 0) {
      setData(null);
      return;
    }
    setLoading(true);
    fetch("/api/portfolio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slugs: watchlist }),
    })
      .then((res) => res.json())
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [watchlist]);

  /** Toggle direction when re-clicking the active column, else switch to it (desc-first). */
  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc((a) => !a);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  const items = React.useMemo(() => {
    if (!data) return [];
    return [...data.items].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "price":
          cmp = (a.currentPrice ?? 0) - (b.currentPrice ?? 0);
          break;
        case "change":
          cmp = (a.priceChange24h ?? 0) - (b.priceChange24h ?? 0);
          break;
        case "volume":
          cmp = (a.volume ?? 0) - (b.volume ?? 0);
          break;
      }
      return sortAsc ? cmp : -cmp;
    });
  }, [data, sortKey, sortAsc]);

  const blended = React.useMemo(() => blendedChange(items), [items]);

  const columns: RankedColumn<PortfolioItem>[] = [
    {
      key: "skin",
      header: (
        <SortButton
          label="Skin"
          columnKey="name"
          active={sortKey === "name"}
          asc={sortAsc}
          onSort={handleSort}
        />
      ),
      width: "minmax(0,1fr)",
      align: "left",
      cell: (it) => (
        <Link
          href={`/items/${it.slug}`}
          className="flex min-w-0 items-center gap-[13px]"
        >
          <SkinTile
            imageUrl={it.imageUrl}
            name={it.name}
            type={it.type}
            rarityColor={rarityCssColor(it.rarityColor)}
            className="h-[42px] w-[42px] shrink-0"
          />
          <div className="min-w-0">
            <span className="block truncate font-sans text-[14.5px] font-bold text-tx">
              {it.name}
            </span>
            <span className="block text-[11.5px] capitalize text-faint">
              {it.type}
              {it.isLimited && (
                <span className="ml-2 text-rarity-legendary">Limited</span>
              )}
              {it.storeStatus === "delisted" && (
                <span className="ml-2 text-[var(--down)]">Delisted</span>
              )}
            </span>
          </div>
        </Link>
      ),
    },
    {
      key: "price",
      header: (
        <SortButton
          label="Price"
          columnKey="price"
          active={sortKey === "price"}
          asc={sortAsc}
          onSort={handleSort}
        />
      ),
      width: "120px",
      align: "right",
      mono: true,
      cell: (it) => (
        <span className="text-[14px] font-bold text-tx">
          {it.currentPrice != null ? <Price amount={it.currentPrice} /> : "—"}
        </span>
      ),
    },
    {
      key: "d24",
      header: (
        <SortButton
          label="24h"
          columnKey="change"
          active={sortKey === "change"}
          asc={sortAsc}
          onSort={handleSort}
        />
      ),
      width: "100px",
      align: "right",
      mono: true,
      cell: (it) => (
        <span
          className="text-[13px]"
          style={{ color: deltaColor(it.priceChange24h) }}
        >
          {it.priceChange24h != null
            ? formatPriceChange(it.priceChange24h)
            : "—"}
        </span>
      ),
    },
    {
      key: "volume",
      header: (
        <SortButton
          label="Listings"
          columnKey="volume"
          active={sortKey === "volume"}
          asc={sortAsc}
          onSort={handleSort}
        />
      ),
      width: "100px",
      align: "right",
      mono: true,
      cell: (it) => (
        <span className="text-[13px] text-mut">
          {it.volume != null ? it.volume.toLocaleString() : "—"}
        </span>
      ),
    },
    {
      key: "d30",
      header: "30d",
      width: "100px",
      align: "right",
      // Real 30d price series from /api/portfolio. New items without enough
      // history (<2 points) show "—" rather than a fake line. The sparkline
      // self-colors by its own 30d net change (up/down), which can legitimately
      // differ from the 24h column.
      cell: (it) =>
        it.spark30d.length >= 2 ? (
          <Sparkline data={it.spark30d} width={80} height={26} />
        ) : (
          <span className="text-[13px] text-mut">—</span>
        ),
    },
    {
      key: "alert",
      header: "Price alert",
      width: "180px",
      align: "left",
      cell: (it) => <AlertCell item={it} />,
    },
    {
      key: "remove",
      header: "",
      width: "44px",
      align: "right",
      cell: (it) => (
        <button
          type="button"
          onClick={() => toggle(it.slug)}
          title="Remove from watchlist"
          aria-label={`Remove ${it.name} from watchlist`}
          className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-[9px] border border-line text-faint transition-colors hover:border-[var(--down)] hover:text-[var(--down)]"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2.4} />
        </button>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-[1240px] px-6 pb-8 pt-9">
      {/* Header */}
      <div className="mb-[22px] flex flex-wrap items-end justify-between gap-5">
        <div>
          <h1 className="flex items-center gap-3 font-display text-[38px] font-extrabold tracking-[-0.02em] text-tx">
            <Heart
              className="h-[30px] w-[30px] text-accent"
              fill="currentColor"
            />
            Your watchlist
          </h1>
          <p className="mt-2 text-[14.5px] text-mut">
            Track the skins you care about and get alerted when they hit your
            price.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {watchlist.length > 0 && (
            <Button
              variant="secondary"
              className="h-11 gap-2 px-5"
              onClick={clear}
            >
              <Trash2 className="h-4 w-4" strokeWidth={2.2} />
              Clear all
            </Button>
          )}
          <Link href="/items">
            <Button className="h-11 gap-2 px-5">
              <Plus className="h-4 w-4" strokeWidth={2.4} />
              Add skins
            </Button>
          </Link>
        </div>
      </div>

      {watchlist.length === 0 ? (
        <EmptyState user={!!user} onSignIn={login} />
      ) : loading && !data ? (
        <div className="rounded-[18px] border border-line bg-panel py-16 text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          <p className="text-sm text-mut">Loading watchlist data…</p>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="mb-[22px] grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard
              label="Tracked value"
              value={<Price amount={data?.totalValue ?? 0} />}
              className="bg-[linear-gradient(135deg,color-mix(in_srgb,var(--accent)_13%,var(--panel)),var(--panel))]"
            />
            <StatCard
              label="24h change"
              value={
                <span style={{ color: deltaColor(blended) }}>
                  {formatPriceChange(blended)}
                </span>
              }
            />
            <StatCard
              label="Avg price"
              value={
                data && data.itemCount > 0 ? (
                  <Price amount={data.totalValue / data.itemCount} />
                ) : (
                  "—"
                )
              }
            />
            <StatCard
              label="Gainers"
              value={
                <span
                  className="inline-flex items-center gap-1.5"
                  style={{ color: "var(--up)" }}
                >
                  <TrendingUp className="h-[18px] w-[18px]" strokeWidth={2.4} />
                  {data?.gainers ?? 0}
                </span>
              }
            />
            <StatCard
              label="Losers"
              value={
                <span
                  className="inline-flex items-center gap-1.5"
                  style={{ color: "var(--down)" }}
                >
                  <TrendingDown
                    className="h-[18px] w-[18px]"
                    strokeWidth={2.4}
                  />
                  {data?.losers ?? 0}
                </span>
              }
            />
            <StatCard
              label="Skins tracked"
              value={data?.itemCount ?? watchlist.length}
            />
          </div>

          {/* Tracked skins table */}
          <RankedTable
            columns={columns}
            rows={items}
            rowKey={(it) => it.id}
            emptyMessage="No tracked skins to show."
          />

          <p className="mt-[18px] text-center text-[12.5px] text-faint">
            Price alerts are sent by email and on-site. Sign in with Steam to
            sync your watchlist across devices.
          </p>
        </>
      )}
    </div>
  );
}

/**
 * Click-to-sort table header. Faint mono uppercase to match RankedTable's
 * header row; turns accent with a directional caret when it's the active sort.
 */
function SortButton({
  label,
  columnKey,
  active,
  asc,
  onSort,
}: {
  label: string;
  columnKey: SortKey;
  active: boolean;
  asc: boolean;
  onSort: (key: SortKey) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSort(columnKey)}
      aria-label={`Sort by ${label}`}
      className={cn(
        "inline-flex select-none items-center gap-1 font-mono text-[11px] uppercase tracking-[.4px] transition-colors",
        active ? "text-accent" : "text-faint hover:text-mut"
      )}
    >
      {label}
      {active ? (
        asc ? (
          <ChevronUp className="h-3 w-3 text-accent" strokeWidth={2.6} />
        ) : (
          <ChevronDown className="h-3 w-3 text-accent" strokeWidth={2.6} />
        )
      ) : (
        <ChevronsUpDown className="h-3 w-3 opacity-50" strokeWidth={2.2} />
      )}
    </button>
  );
}

/**
 * Price-alert cell. When the signed-in user has an active alert on this item
 * (alerts only carry a userId when set while logged in), show the target with a
 * directional arrow and how far the current price is from it. Otherwise a
 * "Set alert" CTA. "% away" = |target − current| / current.
 */
function AlertCell({ item }: { item: PortfolioItem }) {
  const base =
    "inline-flex items-center gap-1.5 rounded-[8px] border border-line px-2.5 py-1 text-[12px] transition-colors hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--line))] hover:text-accent";

  if (!item.alert) {
    return (
      <Link
        href={`/items/${item.slug}#alerts`}
        className={cn(base, "text-faint")}
      >
        <Bell className="h-3 w-3" strokeWidth={2} />
        Set alert
      </Link>
    );
  }

  const { targetPrice, direction } = item.alert;
  const cur = item.currentPrice;
  const pct = cur != null && cur > 0 ? ((targetPrice - cur) / cur) * 100 : null;
  const Arrow = direction === "above" ? ArrowUp : ArrowDown;

  return (
    <Link
      href={`/items/${item.slug}#alerts`}
      title={`Alert when price goes ${direction} ${targetPrice}`}
      className={cn(base, "text-mut")}
    >
      <Arrow
        className="h-3 w-3 shrink-0"
        strokeWidth={2.4}
        style={{ color: direction === "above" ? "var(--up)" : "var(--down)" }}
      />
      <Price amount={targetPrice} />
      {pct != null && (
        <span className="text-faint">
          ·{" "}
          {Math.abs(pct) < 0.5 ? "at target" : `${Math.abs(pct).toFixed(0)}% away`}
        </span>
      )}
    </Link>
  );
}

function EmptyState({
  user,
  onSignIn,
}: {
  user: boolean;
  onSignIn: () => void;
}) {
  return (
    <div className="rounded-[18px] border border-line bg-panel px-6 py-16 text-center">
      <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-[18px] border border-line bg-bg2">
        <Heart className="h-8 w-8 text-faint" strokeWidth={1.6} />
      </div>
      <h2 className="font-display text-[22px] font-extrabold tracking-[-0.01em] text-tx">
        Your watchlist is empty
      </h2>
      <p className="mx-auto mt-2 max-w-md text-[14px] text-mut">
        Browse skins and tap the heart to start tracking prices, 24h moves, and
        price alerts — all in one place.
      </p>
      <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
        <Link href="/items">
          <Button className="gap-2">
            <Plus className="h-4 w-4" strokeWidth={2.4} />
            Browse skins
          </Button>
        </Link>
        {!user && (
          <Button variant="secondary" onClick={onSignIn}>
            Sign in with Steam
          </Button>
        )}
      </div>
      {!user && (
        <p className="mt-5 text-[12.5px] text-faint">
          Sign in with Steam to sync your watchlist across devices.
        </p>
      )}
    </div>
  );
}
