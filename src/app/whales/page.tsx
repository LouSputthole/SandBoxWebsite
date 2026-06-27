import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { Price } from "@/components/ui/price";
import { RankedTable, RankBadge, type RankedColumn } from "@/components/data";
import { GradientAvatar } from "./_components/gradient-avatar";
import { WhaleStat } from "./_components/whale-stat";

export const revalidate = 1800; // 30 minutes

export const metadata: Metadata = {
  title: "Whales — Biggest S&box Skin Collectors",
  description:
    "The biggest S&box skin collectors ranked by estimated portfolio value. Who owns the rarest items and largest inventories across the S&box economy.",
  alternates: { canonical: "/whales" },
};

interface Whale {
  steamId: string;
  name: string;
  totalValue: number;
  totalQuantity: number;
  uniqueItems: number;
  /** Value-weighted 24h price change across the wallet's holdings (%). */
  change24h: number;
  /** Name of the wallet's single most valuable holding. */
  topHolding: string;
}

interface WhaleAccumulator {
  steamId: string;
  name: string;
  totalValue: number;
  totalQuantity: number;
  /** Σ(itemValue × item 24h %), divided by totalValue to weight the change. */
  weightedChangeNum: number;
  /** Tracks the single most valuable holding seen so far. */
  topHolding: string;
  topHoldingValue: number;
  uniqueItems: number;
}

async function getWhales(): Promise<Whale[]> {
  // "topHolders" remains the schema field name — that's the per-item
  // holders JSON blob from sbox.dev. Here we aggregate across items to
  // derive the site-wide "whale" ranking.
  const items = await prisma.item.findMany({
    where: { topHolders: { not: Prisma.JsonNull } },
    select: {
      name: true,
      slug: true,
      currentPrice: true,
      priceChange24h: true,
      topHolders: true,
    },
  });

  const byWhale = new Map<string, WhaleAccumulator>();

  for (const item of items) {
    if (!item.topHolders || !Array.isArray(item.topHolders)) continue;
    const price = item.currentPrice ?? 0;
    if (price <= 0) continue;
    const change = item.priceChange24h ?? 0;

    for (const h of item.topHolders as unknown as Array<{
      steamId: string;
      name: string;
      quantity: number;
    }>) {
      if (!h.steamId) continue;
      const existing = byWhale.get(h.steamId) ?? {
        steamId: h.steamId,
        name: h.name,
        totalValue: 0,
        totalQuantity: 0,
        weightedChangeNum: 0,
        topHolding: "",
        topHoldingValue: 0,
        uniqueItems: 0,
      };
      const value = price * h.quantity;
      existing.totalValue += value;
      existing.totalQuantity += h.quantity;
      existing.weightedChangeNum += value * change;
      existing.uniqueItems += 1;
      if (value > existing.topHoldingValue) {
        existing.topHoldingValue = value;
        existing.topHolding = item.name;
      }
      byWhale.set(h.steamId, existing);
    }
  }

  return Array.from(byWhale.values())
    .map((w) => ({
      steamId: w.steamId,
      name: w.name,
      totalValue: w.totalValue,
      totalQuantity: w.totalQuantity,
      uniqueItems: w.uniqueItems,
      change24h: w.totalValue > 0 ? w.weightedChangeNum / w.totalValue : 0,
      topHolding: w.topHolding,
    }))
    .sort((a, b) => b.totalValue - a.totalValue)
    .slice(0, 50);
}

const columns: RankedColumn<Whale>[] = [
  {
    key: "rank",
    header: "Rank",
    width: "56px",
    align: "left",
    cell: (_w, i) => <RankBadge rank={i + 1} />,
  },
  {
    key: "wallet",
    header: "Wallet",
    width: "1fr",
    align: "left",
    cell: (w) => (
      <div className="flex min-w-0 items-center gap-[13px]">
        <GradientAvatar seed={w.steamId} name={w.name} />
        <div className="min-w-0">
          <span className="block truncate text-[14.5px] font-bold text-tx">
            {w.name}
          </span>
          {w.topHolding && (
            <span className="text-[11.5px] text-faint">top: {w.topHolding}</span>
          )}
        </div>
      </div>
    ),
  },
  {
    key: "holdings",
    header: "Holdings",
    width: "150px",
    align: "right",
    mono: true,
    cellClassName: "text-[15px] font-bold text-tx",
    cell: (w) => <Price amount={w.totalValue} />,
  },
  {
    key: "items",
    header: "Items",
    width: "90px",
    align: "right",
    mono: true,
    cellClassName: "text-[13px] text-mut",
    cell: (w) => w.totalQuantity.toLocaleString(),
  },
  {
    key: "change",
    header: "24h",
    width: "120px",
    align: "right",
    mono: true,
    cellClassName: "text-[13px]",
    cell: (w) => (
      <span
        style={{
          color:
            w.change24h > 0
              ? "var(--up)"
              : w.change24h < 0
                ? "var(--down)"
                : "var(--mut)",
        }}
      >
        {(w.change24h > 0 ? "+" : "") + w.change24h.toFixed(1) + "%"}
      </span>
    ),
  },
];

export default async function WhalesPage() {
  const whales = await getWhales();

  const grandTotal = whales.reduce((sum, w) => sum + w.totalValue, 0);
  const topShare = grandTotal > 0 ? (whales[0].totalValue / grandTotal) * 100 : 0;

  return (
    <div className="mx-auto max-w-[1240px] px-6 py-9">
      {/* Header */}
      <div className="mb-[22px]">
        <h1 className="flex items-center gap-3 font-display text-[38px] font-extrabold tracking-[-.02em] text-tx">
          <svg
            width="34"
            height="34"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="text-accent"
            aria-hidden
          >
            <path d="M3 13c2-1 4-1 6 0s4 1 6 0 4-1 6 0v3c-2 1-4 1-6 0s-4-1-6 0-4 1-6 0zM16 8a3 3 0 11-6 0 3 3 0 016 0zM20 9c1 0 2 1 2 2" />
          </svg>
          Whales
        </h1>
        <p className="mt-2 text-[14.5px] text-mut">
          The biggest S&amp;box inventories on the market, ranked by estimated value.
        </p>
      </div>

      {/* Stat chips */}
      <div className="mb-[22px] grid grid-cols-1 gap-4 sm:grid-cols-3">
        <WhaleStat label="Whales tracked" value={whales.length.toLocaleString()} />
        <WhaleStat label="Combined holdings" value={<Price amount={grandTotal} />} />
        <WhaleStat
          label="Top wallet share"
          value={`${topShare.toFixed(1)}%`}
          accent
        />
      </div>

      {/* Ranked table */}
      <RankedTable
        columns={columns}
        rows={whales}
        rowKey={(w) => w.steamId}
        rowHref={(w) => `/u/${w.steamId}`}
        emptyMessage="No whale data yet. Check back after the next sync."
      />

      <p className="mt-[18px] text-center text-[12.5px] text-faint">
        Estimated from public Steam inventories. Private inventories are not tracked.
      </p>
    </div>
  );
}
