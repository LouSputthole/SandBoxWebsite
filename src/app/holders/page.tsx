import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { Trophy, ExternalLink } from "lucide-react";
import { formatPrice } from "@/lib/utils";

export const revalidate = 1800; // 30 minutes

export const metadata: Metadata = {
  title: "Top Holders — S&box Skin Whales",
  description:
    "The biggest S&box skin holders ranked by estimated portfolio value. Who owns the rarest items and largest inventories across the S&box economy.",
  alternates: { canonical: "/holders" },
};

interface Holder {
  steamId: string;
  name: string;
  avatarUrl: string;
  items: { name: string; slug: string; quantity: number; price: number; value: number }[];
  totalValue: number;
  totalQuantity: number;
  uniqueItems: number;
}

async function getTopHolders(): Promise<Holder[]> {
  const items = await prisma.item.findMany({
    where: { topHolders: { not: Prisma.JsonNull } },
    select: {
      name: true,
      slug: true,
      currentPrice: true,
      topHolders: true,
    },
  });

  const byHolder = new Map<string, Holder>();

  for (const item of items) {
    if (!item.topHolders || !Array.isArray(item.topHolders)) continue;
    const price = item.currentPrice ?? 0;
    if (price <= 0) continue;

    for (const h of item.topHolders as unknown as Array<{
      steamId: string;
      name: string;
      avatarUrl: string;
      quantity: number;
    }>) {
      if (!h.steamId) continue;
      const existing = byHolder.get(h.steamId) ?? {
        steamId: h.steamId,
        name: h.name,
        avatarUrl: h.avatarUrl,
        items: [],
        totalValue: 0,
        totalQuantity: 0,
        uniqueItems: 0,
      };
      const value = price * h.quantity;
      existing.items.push({
        name: item.name,
        slug: item.slug,
        quantity: h.quantity,
        price,
        value,
      });
      existing.totalValue += value;
      existing.totalQuantity += h.quantity;
      existing.uniqueItems = existing.items.length;
      byHolder.set(h.steamId, existing);
    }
  }

  return Array.from(byHolder.values())
    .map((h) => ({ ...h, items: h.items.sort((a, b) => b.value - a.value) }))
    .sort((a, b) => b.totalValue - a.totalValue)
    .slice(0, 50);
}

// Import at bottom so getTopHolders can use Prisma.JsonNull without a top-level hoist issue
import { Prisma } from "@/generated/prisma/client";

export default async function HoldersPage() {
  const holders = await getTopHolders();

  const grandTotal = holders.reduce((sum, h) => sum + h.totalValue, 0);

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-amber-500/10">
            <Trophy className="h-5 w-5 text-amber-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">Top Holders</h1>
        </div>
        <p className="text-sm text-neutral-400">
          Biggest known S&box skin holders ranked by portfolio value. Only shows holders that appear in
          the top 10 for at least one tracked item.
        </p>
        {holders.length > 0 && (
          <p className="text-xs text-neutral-600 mt-2">
            Tracking {holders.length} holders · combined portfolio value{" "}
            <span className="text-white font-medium">{formatPrice(grandTotal)}</span>
          </p>
        )}
      </div>

      {holders.length === 0 ? (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-12 text-center">
          <p className="text-sm text-neutral-500">No holder data yet. Check back after the next sync.</p>
        </div>
      ) : (
        <div className="space-y-1">
          {holders.map((h, i) => (
            <HolderRow key={h.steamId} holder={h} rank={i + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function HolderRow({ holder, rank }: { holder: Holder; rank: number }) {
  const rankColor =
    rank === 1
      ? "bg-amber-500/20 text-amber-400"
      : rank === 2
        ? "bg-neutral-400/20 text-neutral-300"
        : rank === 3
          ? "bg-orange-500/20 text-orange-400"
          : "bg-neutral-800/50 text-neutral-500";

  return (
    <details className="rounded-lg border border-neutral-800 bg-neutral-900/30 overflow-hidden">
      <summary className="flex items-center gap-4 px-4 py-3 cursor-pointer hover:bg-neutral-800/30 list-none">
        <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold ${rankColor}`}>
          {rank}
        </span>
        <img
          src={holder.avatarUrl}
          alt=""
          className="h-10 w-10 rounded-full border border-neutral-700/50"
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white truncate">{holder.name}</p>
          <p className="text-[11px] text-neutral-500">
            {holder.uniqueItems} unique · {holder.totalQuantity} total items
          </p>
        </div>
        <div className="text-right">
          <p className="text-base font-semibold text-white">{formatPrice(holder.totalValue)}</p>
        </div>
      </summary>
      <div className="px-4 py-3 border-t border-neutral-800 bg-neutral-950/30">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] uppercase tracking-wider text-neutral-600">Top items</p>
          <a
            href={`https://steamcommunity.com/profiles/${holder.steamId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
          >
            Steam profile
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        <div className="space-y-1">
          {holder.items.slice(0, 8).map((it) => (
            <Link
              key={it.slug}
              href={`/items/${it.slug}`}
              className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-neutral-800/50 transition-colors"
            >
              <span className="text-xs text-neutral-300 truncate flex-1">{it.name}</span>
              <span className="text-xs text-neutral-500 ml-2">
                {it.quantity}× · {formatPrice(it.value)}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </details>
  );
}
