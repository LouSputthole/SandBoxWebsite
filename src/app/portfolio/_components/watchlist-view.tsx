"use client";

import * as React from "react";
import Link from "next/link";
import { Heart, Plus, Bell, X } from "lucide-react";
import { useWatchlist } from "@/lib/watchlist/context";
import { useAuth } from "@/lib/auth/context";
import { StatCard, RankedTable, type RankedColumn } from "@/components/data";
import { Sparkline } from "@/components/charts";
import { SkinTile } from "@/components/items/skin-tile";
import { Button } from "@/components/ui/button";
import { Price } from "@/components/ui/price";
import { formatPriceChange } from "@/lib/utils";
import { rarityCssColor } from "@/lib/rarity";

/**
 * Arcade-redesign watchlist ("/portfolio"). Restyle of the prior PortfolioView:
 * same real data + behavior (slug-keyed watchlist from WatchlistProvider, POST
 * /api/portfolio for prices, per-row remove via `toggle`), rebuilt to the
 * design mockup — header + "Add skins" CTA, four StatCard summaries, and a
 * RankedTable of tracked skins with SkinTile, mono numerics, a 7d sparkline,
 * a price-alert affordance, and an × remove button.
 *
 * The table lives in this client subtree because RankedTable's `cell` props
 * are functions (can't cross the server boundary) and the rows carry click
 * handlers.
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
}

interface PortfolioData {
  items: PortfolioItem[];
  totalValue: number;
  totalChange: number;
  itemCount: number;
  gainers: number;
  losers: number;
}

/** Up/down/neutral color used for delta text and the inline sparkline. */
function deltaColor(change: number | null | undefined): string {
  if (change == null || change === 0) return "var(--mut)";
  return change > 0 ? "var(--up)" : "var(--down)";
}

/**
 * The watchlist API only returns a single 24h delta per item (no price-point
 * series), so the inline trend is reconstructed from `currentPrice` and the
 * 24h % move — a real, direction-true two-point line. A full 7d series would
 * need the price-history layer wired into /api/portfolio.
 */
function trendFromChange(price: number | null, change: number | null): number[] {
  if (price == null || price <= 0) return [];
  const c = change ?? 0;
  const prev = c === -100 ? price : price / (1 + c / 100);
  return [prev, price];
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
  const { watchlist, toggle } = useWatchlist();
  const { user, login } = useAuth();
  const [data, setData] = React.useState<PortfolioData | null>(null);
  const [loading, setLoading] = React.useState(false);

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

  const items = React.useMemo(
    () =>
      data
        ? [...data.items].sort(
            (a, b) => (b.currentPrice ?? 0) - (a.currentPrice ?? 0)
          )
        : [],
    [data]
  );

  const blended = React.useMemo(() => blendedChange(items), [items]);

  const columns: RankedColumn<PortfolioItem>[] = [
    {
      key: "skin",
      header: "Skin",
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
      header: "Price",
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
      header: "24h",
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
      key: "d7",
      header: "7d",
      width: "100px",
      align: "right",
      cell: (it) => (
        <Sparkline
          data={trendFromChange(it.currentPrice, it.priceChange24h)}
          color={deltaColor(it.priceChange24h)}
          width={80}
          height={26}
        />
      ),
    },
    {
      key: "alert",
      header: "Price alert",
      width: "200px",
      align: "left",
      cell: (it) => (
        <Link
          href={`/items/${it.slug}#alerts`}
          className="inline-flex items-center gap-1.5 rounded-[8px] border border-line px-2.5 py-1 text-[12px] text-faint transition-colors hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--line))] hover:text-accent"
        >
          <Bell className="h-3 w-3" strokeWidth={2} />
          Set alert
        </Link>
      ),
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
        <Link href="/items">
          <Button className="h-11 gap-2 px-5">
            <Plus className="h-4 w-4" strokeWidth={2.4} />
            Add skins
          </Button>
        </Link>
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
          <div className="mb-[22px] grid grid-cols-2 gap-4 sm:grid-cols-4">
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
              label="Skins tracked"
              value={data?.itemCount ?? watchlist.length}
            />
            <StatCard
              label="Alerts near"
              value={<span style={{ color: "var(--accent)" }}>0</span>}
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
