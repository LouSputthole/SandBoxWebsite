"use client";

import { useMemo } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { ExternalLink, GitCompare, Heart, User, Users } from "lucide-react";
import { SkinTile } from "@/components/items/skin-tile";
import { Price } from "@/components/ui/price";
import { Tooltip } from "@/components/ui/tooltip";
import { PriceAlertForm } from "@/components/alerts/price-alert-form";
import { useWatchlist } from "@/lib/watchlist/context";
import { formatPriceChange } from "@/lib/utils";
import { rarityCssColor, rarityLabel } from "@/lib/rarity";
import { isDrop, ITEM_DROP_LABEL } from "@/lib/items/drop-label";
import { useOrders } from "@/app/items/[slug]/_components/use-orders";
import { OrderBookSection } from "@/app/items/[slug]/_components/order-book-section";
import { SpreadAnalysis } from "@/app/items/[slug]/_components/spread-analysis";
import { PriceSignals } from "@/app/items/[slug]/_components/price-signals";
import { PriceHistoryCard } from "@/app/items/[slug]/_components/price-history-card";

interface PricePoint {
  id: string;
  price: number;
  volume: number | null;
  timestamp: string;
}

interface TopHolder {
  name: string;
  steamId: string;
  avatarUrl: string;
  quantity: number;
  sharePercent: number;
}

export interface ItemDetailData {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  type: string;
  imageUrl: string | null;
  marketUrl: string | null;
  steamMarketId: string | null;
  sboxFullIdent: string | null;
  currentPrice: number | null;
  lowestPrice: number | null;
  medianPrice: number | null;
  volume: number | null;
  totalSupply: number | null;
  priceChange24h: number | null;
  isLimited: boolean;
  storeStatus: string;
  delistedAt: string | null;
  storePrice: number | null;
  priceHistory: PricePoint[];
  // sbox.dev enrichment
  releaseDate: string | null;
  releasePrice: number | null;
  uniqueOwners: number | null;
  soldPast24h: number | null;
  supplyOnMarket: number | null;
  totalSales: number | null;
  scarcityScore: number | null;
  isActiveStoreItem: boolean;
  isPermanentStoreItem: boolean;
  leavingStoreAt: string | null;
  itemDisplayName: string | null;
  category: string | null;
  itemSubType: string | null;
  priceChange6h: number | null;
  priceChange6hPercent: number | null;
  topHolders: TopHolder[] | null;
  // Steam-sourced rarity tint (asset_description.name_color), when present.
  rarityColor: string | null;
  // Drop items (sbox.dev) — random in-game drops, no store price.
  isDroppableItem: boolean;
  droppedUnits: number | null;
  rarity: string | null;
}

// =============================================================================
//  Page
// =============================================================================

export function ItemDetail({ item }: { item: ItemDetailData }) {
  const change = item.priceChange24h ?? 0;
  // Fetch the Steam order histogram once and share it across the order-book
  // summary/ladder and the spread-analysis panel (both read the same payload).
  const orders = useOrders(item.slug);
  // Pure helpers (no Date/random) — safe in the render body. Both return null
  // when there's no valid rarity color, gating the rarity glow / badges.
  const rarityColor = rarityCssColor(item.rarityColor);
  const rarityName = rarityLabel(item.rarityColor);
  const glow = rarityColor ?? "var(--accent)";
  const typeLabel = item.category ?? item.type;

  return (
    <div className="mx-auto max-w-[1240px] px-6 pb-2 pt-[22px]">
      {/* Breadcrumb */}
      <nav className="mb-[22px] flex flex-wrap items-center gap-2 text-[13px] text-faint">
        <Link href="/" className="hover:text-tx">
          Home
        </Link>
        <span>/</span>
        <Link href="/items" className="hover:text-tx">
          Skins
        </Link>
        <span>/</span>
        <span className="capitalize">{typeLabel}</span>
        <span>/</span>
        <span className="text-mut">{item.name}</span>
      </nav>

      {/* Header */}
      <div className="grid animate-pop-up grid-cols-1 items-start gap-8 md:grid-cols-[380px_1fr]">
        <ImageColumn
          item={item}
          rarityColor={rarityColor}
          rarityName={rarityName}
          glow={glow}
        />
        <InfoColumn
          item={item}
          change={change}
          rarityColor={rarityColor}
          typeLabel={typeLabel}
        />
      </div>

      {/* Chart + Order book */}
      <div className="mt-[30px] grid grid-cols-1 gap-[18px] lg:grid-cols-[1.6fr_1fr]">
        <PriceHistoryCard
          priceHistory={item.priceHistory}
          priceChange24h={item.priceChange24h}
        />
        <OrderBookSection orders={orders} />
      </div>

      {/* Price signals + Spread analysis (derived market read) */}
      <div className="mt-[18px] grid grid-cols-1 gap-[18px] lg:grid-cols-[1.6fr_1fr]">
        <PriceSignals item={item} />
        <SpreadAnalysis orders={orders} />
      </div>

      {/* Recent prices + Supply / scarcity */}
      <div className="mt-[18px] grid grid-cols-1 gap-[18px] lg:grid-cols-[1.6fr_1fr]">
        <RecentSalesCard priceHistory={item.priceHistory} />
        <SupplyScarcityCard item={item} />
      </div>

      {/* Top holders (kept — real supply-source data, not in the mockup) */}
      {item.topHolders && item.topHolders.length > 0 && (
        <TopHolders holders={item.topHolders} uniqueOwners={item.uniqueOwners} />
      )}
    </div>
  );
}

// =============================================================================
//  Header — image column
// =============================================================================

function ImageColumn({
  item,
  rarityColor,
  rarityName,
  glow,
}: {
  item: ItemDetailData;
  rarityColor: string | null;
  rarityName: string | null;
  glow: string;
}) {
  return (
    <div
      className="relative rounded-[22px] p-[1.5px]"
      style={{
        background: `linear-gradient(150deg, color-mix(in srgb, ${glow} 55%, transparent), transparent 55%)`,
      }}
    >
      {/* ambient halo */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-[22px] z-0"
        style={{
          background: `radial-gradient(circle at 50% 40%, color-mix(in srgb, ${glow} 30%, transparent), transparent 64%)`,
          filter: "blur(32px)",
        }}
      />
      <div
        className="relative z-[1] rounded-[21px] border border-line p-4"
        style={{ background: "linear-gradient(180deg, var(--panel), var(--panel2))" }}
      >
        <div className="relative">
          <SkinTile
            imageUrl={item.imageUrl}
            name={item.name}
            type={item.type}
            rarityColor={rarityColor}
            iconSize="lg"
            className="animate-floaty !rounded-[16px]"
          />
          {rarityColor && (
            <span
              className="absolute left-3 top-3 z-10 rounded-[8px] border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[.4px] backdrop-blur"
              style={{
                color: rarityColor,
                background: "rgba(14,13,19,.7)",
                borderColor: `color-mix(in srgb, ${rarityColor} 40%, transparent)`,
              }}
            >
              {rarityName ?? "Rarity"}
            </span>
          )}
        </div>

        {/* mini-stats */}
        <div className="mt-3 flex gap-2">
          <MiniStat
            label="Supply"
            value={item.totalSupply?.toLocaleString() ?? "—"}
          />
          <MiniStat
            label="Owners"
            value={item.uniqueOwners?.toLocaleString() ?? "—"}
          />
          <MiniStat
            label="Scarcity"
            value={
              item.scarcityScore != null
                ? String(Math.round(item.scarcityScore))
                : "—"
            }
            accent
          />
        </div>
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex-1 rounded-[11px] border border-line bg-bg2 p-[9px] text-center">
      <div
        className={`font-mono text-[14px] font-bold ${accent ? "text-accent" : "text-tx"}`}
      >
        {value}
      </div>
      <div className="text-[10.5px] text-faint">{label}</div>
    </div>
  );
}

// =============================================================================
//  Header — info column
// =============================================================================

function InfoColumn({
  item,
  change,
  rarityColor,
  typeLabel,
}: {
  item: ItemDetailData;
  change: number;
  rarityColor: string | null;
  typeLabel: string;
}) {
  const typeTint = rarityColor ?? "var(--accent)";
  const positive = change > 0;
  const negative = change < 0;
  const deltaColor = positive ? "var(--up)" : negative ? "var(--down)" : "var(--mut)";
  const arrow = positive ? "▲" : negative ? "▼" : "";

  // Header "Spread" tile: current price over the lowest ask, with % vs lowest.
  const spreadAbs =
    item.currentPrice != null && item.lowestPrice != null
      ? item.currentPrice - item.lowestPrice
      : null;
  const spreadPctVsLow =
    spreadAbs != null && item.lowestPrice
      ? (spreadAbs / item.lowestPrice) * 100
      : null;

  return (
    <div>
      {/* type badge + meta */}
      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        <span
          className="rounded-[8px] px-2.5 py-1 text-[12px] font-bold capitalize"
          style={{
            color: typeTint,
            background: `color-mix(in srgb, ${typeTint} 15%, transparent)`,
          }}
        >
          {typeLabel}
        </span>
        {item.itemSubType && (
          <span className="text-[12px] text-faint">{item.itemSubType}</span>
        )}
        {item.itemDisplayName && (
          <span className="text-[12px] text-faint">{item.itemDisplayName}</span>
        )}
        {item.isLimited && (
          <span className="text-[12px] text-faint">Limited</span>
        )}
        {item.isActiveStoreItem ? (
          <span className="text-[12px] text-up">
            In store
            {item.leavingStoreAt
              ? ` · leaves ${formatTimeLeft(item.leavingStoreAt)}`
              : item.isPermanentStoreItem
                ? " · permanent"
                : ""}
          </span>
        ) : item.storeStatus === "delisted" ? (
          <span className="text-[12px] text-faint">Not in store</span>
        ) : null}
      </div>

      <h1 className="m-0 mb-4 font-display text-[46px] font-extrabold leading-none tracking-[-0.02em] text-tx">
        {item.name}
      </h1>

      {/* price + delta */}
      <div className="mb-1.5 flex flex-wrap items-end gap-4">
        <span className="font-mono text-[42px] font-bold leading-none tracking-[-1px] text-tx">
          {item.currentPrice != null ? <Price amount={item.currentPrice} /> : "N/A"}
        </span>
        {item.currentPrice != null && (
          <span
            className="pb-1.5 font-mono text-[16px] font-bold"
            style={{ color: deltaColor }}
          >
            {arrow ? `${arrow} ` : ""}
            {formatPriceChange(change)}{" "}
            <span className="font-medium text-faint">24h</span>
          </span>
        )}
        {item.priceChange6hPercent != null && item.priceChange6hPercent !== 0 && (
          <span
            className="pb-2 font-mono text-[12px] font-bold"
            style={{
              color: item.priceChange6hPercent > 0 ? "var(--up)" : "var(--down)",
            }}
          >
            {item.priceChange6hPercent > 0 ? "+" : ""}
            {item.priceChange6hPercent.toFixed(1)}%{" "}
            <span className="font-medium text-faint">6h</span>
          </span>
        )}
      </div>

      {/* subtext / store price / drop label */}
      <PriceSubtext item={item} />

      {/* description */}
      {item.description && (
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-mut">
          {item.description}
        </p>
      )}

      {/* primary CTAs */}
      <div className="mb-4 mt-[18px] flex flex-wrap items-center gap-3">
        {item.marketUrl && (
          <a
            href={item.marketUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-[13px] bg-accent px-[22px] py-[13px] text-[14.5px] font-bold text-white shadow-[0_12px_26px_-12px_var(--accent)] transition hover:-translate-y-0.5 hover:brightness-[1.06]"
          >
            View on Steam Market
            <ExternalLink className="h-[15px] w-[15px]" />
          </a>
        )}
        <WatchlistCta slug={item.slug} />
        <Link
          href={`/compare?a=${encodeURIComponent(item.slug)}`}
          className="inline-flex items-center gap-2 rounded-[13px] border border-line bg-panel px-5 py-[13px] text-[14.5px] font-semibold text-tx transition-colors hover:[border-color:color-mix(in_srgb,var(--accent)_40%,var(--line))]"
        >
          <GitCompare className="h-4 w-4" />
          Compare
        </Link>
        <PriceAlertForm
          itemId={item.id}
          itemName={item.name}
          currentPrice={item.currentPrice}
        />
      </div>

      {/* secondary links */}
      <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px]">
        {item.sboxFullIdent && (
          <a
            href={`https://sbox.game/${item.sboxFullIdent.replace(".", "/")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-mut transition-colors hover:text-tx"
          >
            View on sbox.game
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
        <a
          href="https://sbox.game/metrics/skins"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-mut transition-colors hover:text-tx"
        >
          S&amp;box Metrics
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      {/* stat tiles */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile
          label="Lowest ask"
          value={item.lowestPrice != null ? <Price amount={item.lowestPrice} /> : "N/A"}
        />
        <StatTile
          label="Median"
          value={item.medianPrice != null ? <Price amount={item.medianPrice} /> : "N/A"}
        />
        <StatTile
          label="Spread"
          tip="Current price minus the lowest ask, with the % premium over that lowest ask. A wide spread can mean a thin or volatile market."
          value={
            spreadAbs != null ? (
              <>
                <Price amount={spreadAbs} />
                {spreadPctVsLow != null && (
                  <span className="ml-1 text-[11px] font-medium text-faint">
                    {spreadPctVsLow >= 0 ? "+" : ""}
                    {spreadPctVsLow.toFixed(1)}%
                  </span>
                )}
              </>
            ) : (
              "N/A"
            )
          }
        />
        <StatTile
          label="Volume"
          value={item.volume != null ? item.volume.toLocaleString() : "N/A"}
        />
        <StatTile
          label="Released"
          value={
            item.releaseDate ? (
              <>
                {new Date(item.releaseDate).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
                <span className="mt-0.5 block text-[10.5px] font-medium text-faint">
                  {formatReleaseAge(item.releaseDate)}
                </span>
              </>
            ) : (
              "N/A"
            )
          }
        />
      </div>
    </div>
  );
}

function PriceSubtext({ item }: { item: ItemDetailData }) {
  if (item.releasePrice != null) {
    // In-store item with no live market price → store price is the only real
    // signal, so make it prominent (mirrors the legacy behavior).
    if (item.isActiveStoreItem && item.currentPrice == null) {
      return (
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-up">
            Store price
          </span>
          <span className="font-mono text-[22px] font-bold text-up">
            <Price amount={item.releasePrice} />
          </span>
          <span className="text-[11px] text-faint">in-game</span>
        </div>
      );
    }
    return (
      <p className="text-[13px] text-faint">
        Lowest current ask on the Steam Community Market · Store price{" "}
        <Price amount={item.releasePrice} />
      </p>
    );
  }

  if (isDrop(item)) {
    const dropColor = rarityCssColor(item.rarityColor);
    return (
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-cat-tool">
          {ITEM_DROP_LABEL}
        </span>
        {item.rarity && (
          <span
            className="text-xs font-semibold capitalize"
            style={dropColor ? { color: dropColor } : undefined}
          >
            {item.rarity}
          </span>
        )}
        {item.droppedUnits != null && item.droppedUnits > 0 && (
          <span className="text-[11px] text-faint">
            {item.droppedUnits.toLocaleString()} dropped
          </span>
        )}
      </div>
    );
  }

  return (
    <p className="text-[13px] text-faint">
      Lowest current ask on the Steam Community Market
    </p>
  );
}

function StatTile({
  label,
  value,
  tip,
}: {
  label: string;
  value: ReactNode;
  tip?: string;
}) {
  return (
    <div className="rounded-[13px] border border-line bg-panel px-3.5 py-3">
      <div className="mb-1 flex items-center gap-1 text-[11px] text-faint">
        {label}
        {tip && <Tooltip asIcon content={tip} />}
      </div>
      <div className="font-mono text-[15px] font-bold text-tx">{value}</div>
    </div>
  );
}

function WatchlistCta({ slug }: { slug: string }) {
  const { isWatching, toggle } = useWatchlist();
  const active = isWatching(slug);
  return (
    <button
      type="button"
      onClick={() => toggle(slug)}
      title={active ? "Remove from watchlist" : "Add to watchlist"}
      className="inline-flex items-center gap-2 rounded-[13px] border border-line bg-panel px-5 py-[13px] text-[14.5px] font-semibold text-tx transition-colors hover:[border-color:color-mix(in_srgb,var(--accent)_40%,var(--line))]"
    >
      <Heart
        className={`h-4 w-4 ${active ? "fill-pink-400 text-pink-400" : ""}`}
      />
      {active ? "Watching" : "Watchlist"}
    </button>
  );
}

// =============================================================================
//  Recent prices (derived from tracked price history — no per-sale feed exists)
// =============================================================================

function RecentSalesCard({ priceHistory }: { priceHistory: PricePoint[] }) {
  const rows = useMemo(
    () =>
      [...priceHistory]
        .sort(
          (a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
        )
        .slice(0, 7),
    [priceHistory],
  );

  return (
    <div className="rounded-[18px] border border-line bg-panel p-5">
      <div className="mb-3.5 flex items-baseline justify-between gap-2">
        <h2 className="font-display text-[18px] font-bold text-tx">
          Recent prices
        </h2>
        <span className="text-[11px] text-faint">from tracked price history</span>
      </div>

      {rows.length === 0 ? (
        <div className="py-8 text-center text-sm text-faint">
          No price history tracked yet.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2.5 border-b border-line px-1 pb-2.5 font-mono text-[11px] text-faint">
            <span>PRICE</span>
            <span className="text-center">VOL</span>
            <span className="text-right">WHEN</span>
          </div>
          {rows.map((p) => (
            <div
              key={p.id}
              className="grid grid-cols-3 items-center gap-2.5 border-b border-line2 px-1 py-2.5"
            >
              <span className="font-mono text-[13.5px] font-bold text-tx">
                <Price amount={p.price} />
              </span>
              <span className="text-center font-mono text-[13px] text-mut">
                {p.volume != null ? p.volume.toLocaleString() : "—"}
              </span>
              <span className="text-right text-[12.5px] text-faint">
                {timeAgo(p.timestamp)}
              </span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// =============================================================================
//  Supply & scarcity meters
// =============================================================================

function SupplyScarcityCard({ item }: { item: ItemDetailData }) {
  const supply = item.totalSupply ?? null;
  const onMarket = item.supplyOnMarket ?? null;
  const owners = item.uniqueOwners ?? null;
  const scarcity =
    item.scarcityScore != null ? Math.round(item.scarcityScore) : null;
  const marketCap =
    item.currentPrice != null && supply != null
      ? item.currentPrice * supply
      : null;

  const onMarketPct =
    supply && onMarket != null ? Math.min(100, (onMarket / supply) * 100) : 0;
  const ownersPct =
    supply && owners != null ? Math.min(100, (owners / supply) * 100) : 0;

  return (
    <div className="rounded-[18px] border border-line bg-panel p-5">
      <h2 className="mb-4 font-display text-[18px] font-bold text-tx">
        Supply &amp; scarcity
      </h2>
      <div className="flex flex-col gap-3.5">
        <Meter
          label="On market"
          value={
            onMarket != null
              ? `${onMarket.toLocaleString()}${
                  supply != null ? ` / ${supply.toLocaleString()}` : ""
                }`
              : "—"
          }
          pct={onMarketPct}
          color="var(--accent)"
        />
        <Meter
          label="Unique owners"
          value={owners != null ? owners.toLocaleString() : "—"}
          pct={ownersPct}
          color="var(--rarity-rare)"
        />
        <Meter
          label="Scarcity score"
          value={scarcity != null ? `${scarcity} / 100` : "—"}
          pct={scarcity ?? 0}
          color="linear-gradient(90deg, var(--accent), var(--rarity-legendary))"
          valueAccent
        />
        <div className="mt-1 flex gap-2.5">
          <MiniTile
            value={
              item.soldPast24h != null ? item.soldPast24h.toLocaleString() : "—"
            }
            label="Sold 24h"
          />
          <MiniTile
            value={marketCap != null ? compactUsd(marketCap) : "—"}
            label="Market cap"
          />
        </div>
      </div>
    </div>
  );
}

function Meter({
  label,
  value,
  pct,
  color,
  valueAccent,
}: {
  label: string;
  value: string;
  pct: number;
  color: string;
  valueAccent?: boolean;
}) {
  return (
    <div>
      <div className="mb-1.5 flex justify-between text-[13px]">
        <span className="text-mut">{label}</span>
        <span
          className={`font-mono font-bold ${valueAccent ? "text-accent" : "text-tx"}`}
        >
          {value}
        </span>
      </div>
      <div className="h-[7px] overflow-hidden rounded-[4px] bg-bg2">
        <div
          className="h-full rounded-[4px]"
          style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }}
        />
      </div>
    </div>
  );
}

function MiniTile({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex-1 rounded-[12px] border border-line bg-bg2 p-3">
      <div className="font-mono text-[17px] font-bold text-tx">{value}</div>
      <div className="text-[11px] text-faint">{label}</div>
    </div>
  );
}

// =============================================================================
//  Top holders
// =============================================================================

function TopHolders({
  holders,
  uniqueOwners,
}: {
  holders: TopHolder[];
  uniqueOwners: number | null;
}) {
  return (
    <div className="mt-[18px] rounded-[18px] border border-line bg-panel p-5">
      <div className="mb-3.5 flex items-center gap-2">
        <Users className="h-4 w-4 text-mut" />
        <h2 className="font-display text-[18px] font-bold text-tx">
          Top holders
        </h2>
        {uniqueOwners != null && (
          <span className="text-[12px] text-faint">
            {uniqueOwners.toLocaleString()} unique owners
          </span>
        )}
      </div>
      <div className="space-y-1">
        {holders.map((h, i) => (
          <a
            key={h.steamId}
            href={`https://steamcommunity.com/profiles/${h.steamId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-[11px] px-3 py-2.5 transition-colors hover:bg-bg2"
          >
            <span className="w-5 text-right font-mono text-xs text-faint">
              {i + 1}
            </span>
            {h.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={h.avatarUrl}
                alt=""
                className="h-8 w-8 rounded-full border border-line"
              />
            ) : (
              // No avatar URL → never pass "" to <img src> (Next warns). Render
              // an initials/User fallback in the same h-8 w-8 rounded frame.
              <span className="flex h-8 w-8 items-center justify-center rounded-full border border-line bg-gradient-to-br from-accent/30 to-accent2/20 text-[11px] font-bold text-tx">
                {h.name.trim()[0]?.toUpperCase() ?? (
                  <User className="h-4 w-4 text-mut" />
                )}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-tx">{h.name}</p>
            </div>
            <div className="text-right">
              <p className="font-mono text-sm font-bold text-tx">
                {h.quantity}×
              </p>
              <p className="text-[10px] text-faint">
                {h.sharePercent.toFixed(0)}% of inventory
              </p>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
//  Helpers
// =============================================================================

function compactUsd(n: number): string {
  return (
    "$" +
    new Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(n)
  );
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
}

function formatReleaseAge(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days < 7) return `${days}d ago`;
  if (days < 60) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  const years = (days / 365).toFixed(1);
  return `${years}y ago`;
}

function formatTimeLeft(dateStr: string): string {
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff <= 0) return "soon";
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  if (days > 0) return `${days}d ${hours}h`;
  return `${hours}h`;
}
