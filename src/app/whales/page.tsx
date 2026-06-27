import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { Price } from "@/components/ui/price";
import { WhaleStat } from "./_components/whale-stat";
import { WhalesTable, type Whale } from "./_components/whales-table";

export const revalidate = 1800; // 30 minutes

export const metadata: Metadata = {
  title: "Whales — Biggest S&box Skin Collectors",
  description:
    "The biggest S&box skin collectors ranked by estimated portfolio value. Who owns the rarest items and largest inventories across the S&box economy.",
  alternates: { canonical: "/whales" },
};

const ITEMS_PER_WHALE = 8;

interface WhaleAccumulator {
  steamId: string;
  name: string;
  /** Real Steam avatar URL from the holders blob (may stay empty). */
  avatarUrl: string | null;
  /** Every holding seen for this wallet; sliced to the top N for display. */
  items: {
    name: string;
    slug: string;
    quantity: number;
    value: number;
    imageUrl: string | null;
    type: string;
    rarityColor: string | null;
  }[];
  totalValue: number;
  totalQuantity: number;
  /** Σ(itemValue × item 24h %), divided by totalValue to weight the change. */
  weightedChangeNum: number;
  /** Tracks the single most valuable holding seen so far. */
  topHolding: string;
  topHoldingValue: number;
}

async function getWhales(): Promise<Whale[]> {
  // "topHolders" remains the schema field name — that's the per-item
  // holders JSON blob from sbox.dev. Here we aggregate across items to
  // derive the site-wide "whale" ranking, keeping a per-wallet item
  // breakdown for the expandable "Top items" panel.
  const items = await prisma.item.findMany({
    where: { topHolders: { not: Prisma.JsonNull } },
    select: {
      name: true,
      slug: true,
      type: true,
      imageUrl: true,
      rarityColor: true,
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
      avatarUrl?: string;
      quantity: number;
    }>) {
      if (!h.steamId) continue;
      const existing = byWhale.get(h.steamId) ?? {
        steamId: h.steamId,
        name: h.name,
        avatarUrl: h.avatarUrl || null,
        items: [],
        totalValue: 0,
        totalQuantity: 0,
        weightedChangeNum: 0,
        topHolding: "",
        topHoldingValue: 0,
      };
      // Backfill the avatar from a later holding if the first one lacked it.
      if (!existing.avatarUrl && h.avatarUrl) existing.avatarUrl = h.avatarUrl;
      const value = price * h.quantity;
      existing.items.push({
        name: item.name,
        slug: item.slug,
        quantity: h.quantity,
        value,
        imageUrl: item.imageUrl ?? null,
        type: item.type,
        rarityColor: item.rarityColor ?? null,
      });
      existing.totalValue += value;
      existing.totalQuantity += h.quantity;
      existing.weightedChangeNum += value * change;
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
      avatarUrl: w.avatarUrl,
      // uniqueItems counts ALL distinct holdings; the panel shows the top N.
      uniqueItems: w.items.length,
      items: [...w.items]
        .sort((a, b) => b.value - a.value)
        .slice(0, ITEMS_PER_WHALE),
      totalValue: w.totalValue,
      totalQuantity: w.totalQuantity,
      change24h: w.totalValue > 0 ? w.weightedChangeNum / w.totalValue : 0,
      topHolding: w.topHolding,
    }))
    .sort((a, b) => b.totalValue - a.totalValue)
    .slice(0, 50);
}

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

      {/* Ranked table — expandable per-whale "Top items" breakdown */}
      <WhalesTable whales={whales} />

      <p className="mt-[18px] text-center text-[12.5px] text-faint">
        Estimated from public Steam inventories. Private inventories are not tracked.
      </p>
    </div>
  );
}
