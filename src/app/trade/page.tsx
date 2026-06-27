import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRightLeft, Plus } from "lucide-react";
import { prisma } from "@/lib/db";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  TradeBoard,
  type TradeBoardListing,
} from "./_components/trade-board";

// The board loads in one shot and the client filter chips slice it without a
// round-trip (Arcade mockup has no search box or pagination), so render fresh
// per request rather than ISR.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "S&box Trading Board",
  description:
    "Browse open S&box skin trades, post your own offers, and connect directly with other traders via Steam. No fees, no escrow — just a public bulletin board for the community.",
  alternates: { canonical: "/trade" },
  openGraph: {
    title: "S&box Trading Board — sboxskins.gg",
    description:
      "Browse open S&box skin trades, post your own offers, and connect directly with other traders via Steam.",
  },
};

// Bound the loaded board so the payload stays small even as listings grow; the
// client chips filter within this set.
const BOARD_LIMIT = 60;

export default async function TradePage() {
  const listings = await prisma.tradeListing.findMany({
    where: { status: "active" },
    orderBy: { createdAt: "desc" },
    take: BOARD_LIMIT,
    include: {
      user: { select: { steamId: true, username: true, avatarUrl: true } },
      _count: { select: { comments: true } },
      items: {
        include: {
          item: {
            select: {
              name: true,
              imageUrl: true,
              type: true,
              currentPrice: true,
              rarityColor: true,
            },
          },
        },
      },
    },
  });

  const board: TradeBoardListing[] = listings.map((l) => ({
    id: l.id,
    side: l.side,
    description: l.description,
    createdAt: l.createdAt.toISOString(),
    replies: l._count.comments,
    user: {
      username: l.user.username,
      avatarUrl: l.user.avatarUrl,
      steamId: l.user.steamId,
    },
    items: l.items.map((it) => ({
      id: it.id,
      slot: it.slot,
      customName: it.customName,
      quantity: it.quantity,
      unitPriceAtListing: it.unitPriceAtListing,
      item: it.item
        ? {
            name: it.item.name,
            imageUrl: it.item.imageUrl,
            type: it.item.type,
            currentPrice: it.item.currentPrice,
            rarityColor: it.item.rarityColor,
          }
        : null,
    })),
  }));

  return (
    <div className="mx-auto max-w-[1240px] px-6 py-8">
      {/* header */}
      <div className="mb-[22px] flex flex-wrap items-end justify-between gap-5">
        <div>
          <h1 className="flex items-center gap-3 font-display text-[38px] font-extrabold leading-tight tracking-[-.02em] text-tx">
            <ArrowRightLeft className="h-[30px] w-[30px] text-accent" />
            Trading board
          </h1>
          <p className="mt-2 text-[14.5px] text-mut">
            Find traders, post offers, and swap S&amp;box skins directly with the
            community.
          </p>
        </div>
        <Link
          href="/trade/new"
          className={cn(buttonVariants({ size: "lg" }), "gap-2")}
        >
          <Plus className="h-4 w-4" />
          Post a trade
        </Link>
      </div>

      {/* filter chips + offer grid (client) */}
      <TradeBoard listings={board} />
    </div>
  );
}
