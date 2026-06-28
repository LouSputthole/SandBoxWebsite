"use client";

import Link from "next/link";
import {
  Crown,
  TrendingUp,
  TrendingDown,
  ListOrdered,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { RankedTable, RankBadge, type RankedColumn } from "@/components/data";
import { Sparkline } from "@/components/charts";
import { SkinTile } from "@/components/items/skin-tile";
import { Price } from "@/components/ui/price";
import { rarityCssColor } from "@/lib/rarity";
import { cn, formatPriceChange } from "@/lib/utils";
import { type TabKey, DEFAULT_TAB } from "./tabs";

/**
 * Leaderboard table + tab nav. The server page runs a distinct catalog-wide
 * query per tab (each already ranked + capped) and hands every ranked list down
 * at once; the active tab comes straight from the `?tab=` param (`initialTab`),
 * so the server renders the active tab's table in the initial HTML.
 *
 * The tabs are real <Link> anchors to `/leaderboard?tab=KEY` — one crawlable
 * URL per tab (the site's SEO moat), with `replace`/`scroll={false}` so
 * switching stays snappy without piling up history or jumping the scroll.
 *
 * The table is built here (not on the server) because RankedTable's `cell` and
 * `rowHref` are functions, which can't cross the client boundary.
 */

export interface LeaderboardRow {
  id: string;
  name: string;
  slug: string;
  type: string;
  imageUrl: string | null;
  /** Raw Steam name_color (no '#'); resolved to CSS here. */
  rarityColor: string | null;
  price: number | null;
  change24h: number | null;
  supply: number | null;
  /** Active market listings (supplyOnMarket, falling back to volume). */
  listings: number;
  marketCap: number | null;
  /** 7d price series for the inline sparkline (may be empty). */
  spark: number[];
}

/** One pre-ranked list per tab, fetched server-side. */
export type LeaderboardData = Record<TabKey, LeaderboardRow[]>;

const TAB_DEFS: { key: TabKey; label: string; icon: LucideIcon }[] = [
  { key: "valuable", label: "Most valuable", icon: Crown },
  { key: "gainers", label: "Top gainers", icon: TrendingUp },
  { key: "losers", label: "Top losers", icon: TrendingDown },
  { key: "listed", label: "Most listed", icon: ListOrdered },
  { key: "rarest", label: "Rarest", icon: Sparkles },
];

/** Up/down/neutral color used for both the 24h delta text and its sparkline. */
function deltaColor(change: number | null): string {
  if (change == null || change === 0) return "var(--mut)";
  return change > 0 ? "var(--up)" : "var(--down)";
}

/** Compact USD for market cap (mockup `cap()` — USD, like the reference). */
function formatCompactUsd(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
  return "$" + n.toFixed(0);
}

export function LeaderboardTable({
  lists,
  initialTab,
}: {
  lists: LeaderboardData;
  initialTab: TabKey;
}) {
  // The active tab is driven by the URL (`?tab=`), so following the <Link> tabs
  // below re-renders the page with the right list — no client state to drift.
  const tab = initialTab;
  const rows = lists[tab] ?? [];

  const columns: RankedColumn<LeaderboardRow>[] = [
    {
      key: "rank",
      header: "Rank",
      width: "60px",
      align: "left",
      cell: (_row, i) => <RankBadge rank={i + 1} />,
    },
    {
      key: "skin",
      header: "Skin",
      width: "minmax(0,1fr)",
      align: "left",
      cell: (row) => {
        const rarity = rarityCssColor(row.rarityColor);
        return (
          <div className="flex min-w-0 items-center gap-[13px]">
            <SkinTile
              imageUrl={row.imageUrl}
              name={row.name}
              type={row.type}
              rarityColor={rarity}
              className="h-[42px] w-[42px] shrink-0"
            />
            <div className="min-w-0">
              <span className="block truncate font-sans text-[14.5px] font-bold text-tx">
                {row.name}
              </span>
              <span className="block text-[11.5px] capitalize text-faint">
                {row.type}
              </span>
            </div>
          </div>
        );
      },
    },
    {
      key: "price",
      header: "Price",
      width: "120px",
      align: "right",
      mono: true,
      cell: (row) => (
        <span className="text-[14px] font-bold text-tx">
          {row.price != null ? <Price amount={row.price} /> : "—"}
        </span>
      ),
    },
    {
      key: "change",
      header: "24h",
      width: "100px",
      align: "right",
      mono: true,
      cell: (row) => (
        <span className="text-[13px]" style={{ color: deltaColor(row.change24h) }}>
          {row.change24h != null ? formatPriceChange(row.change24h) : "—"}
        </span>
      ),
    },
    {
      key: "supply",
      header: "Supply",
      width: "110px",
      align: "right",
      mono: true,
      cell: (row) => (
        <span className="text-[13px] text-mut">
          {row.supply != null ? row.supply.toLocaleString() : "—"}
        </span>
      ),
    },
    // ponytail: Listings only surfaces on the "Most listed" tab — it's the
    // ranking metric there (supplyOnMarket→volume); other tabs stay lean.
    ...(tab === "listed"
      ? ([
          {
            key: "listings",
            header: "Listings",
            width: "110px",
            align: "right",
            mono: true,
            cell: (row) => (
              <span className="text-[13px] text-mut">
                {row.listings.toLocaleString()}
              </span>
            ),
          },
        ] satisfies RankedColumn<LeaderboardRow>[])
      : []),
    {
      key: "cap",
      header: "Mkt cap",
      width: "120px",
      align: "right",
      mono: true,
      cell: (row) => (
        <span className="text-[13px] text-mut">{formatCompactUsd(row.marketCap)}</span>
      ),
    },
    {
      key: "spark",
      header: "7d",
      width: "90px",
      align: "right",
      cell: (row) => <Sparkline data={row.spark} color={deltaColor(row.change24h)} />,
    },
  ];

  return (
    <div>
      <nav
        aria-label="Leaderboard categories"
        className="mb-[18px] inline-flex flex-wrap items-center gap-2"
      >
        {TAB_DEFS.map((t) => {
          const Icon = t.icon;
          const isActive = t.key === tab;
          return (
            <Link
              key={t.key}
              href={
                t.key === DEFAULT_TAB
                  ? "/leaderboard"
                  : `/leaderboard?tab=${t.key}`
              }
              replace
              scroll={false}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-[11px] border px-3.5 py-1.5 font-sans text-sm font-semibold transition-colors",
                isActive
                  ? "border-transparent bg-[var(--accent)] text-white"
                  : "border-[var(--line)] bg-[var(--panel)] text-[var(--mut)] hover:text-[var(--tx)]"
              )}
            >
              <Icon className="h-4 w-4 opacity-70" />
              {t.label}
            </Link>
          );
        })}
      </nav>

      <RankedTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        rowHref={(row) => `/items/${row.slug}`}
        emptyMessage="No items to rank yet."
      />
    </div>
  );
}
