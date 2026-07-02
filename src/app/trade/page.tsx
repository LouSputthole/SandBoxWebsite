import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRightLeft, ChevronLeft, ChevronRight, Plus, Sparkles } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { OfferCard, type OfferListing } from "./_components/offer-card";
import { TradeControls, type SideCounts } from "./_components/trade-controls";

// Listings are queried per ?q / ?side / ?page combination, so render fresh per
// request rather than ISR (filtered queries vary too much to cache usefully).
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

// One server page of listings. Pagination makes every listing reachable instead
// of capping the board at a single newest slice.
const PAGE_SIZE = 24;

interface PageProps {
  searchParams: Promise<{ q?: string; side?: string; page?: string }>;
}

export default async function TradePage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const side =
    sp.side === "selling" || sp.side === "buying" || sp.side === "both"
      ? sp.side
      : "";
  const page = Math.max(1, Number(sp.page ?? "1") || 1);

  // The search filter (status + ?q) is shared by the list, its count, and the
  // per-side chip counts. The side filter is layered on top only for the list.
  const baseWhere: Prisma.TradeListingWhereInput = { status: "active" };
  if (q.length > 0) {
    baseWhere.OR = [
      { description: { contains: q, mode: "insensitive" } },
      {
        items: {
          some: {
            OR: [
              { customName: { contains: q, mode: "insensitive" } },
              { item: { name: { contains: q, mode: "insensitive" } } },
            ],
          },
        },
      },
    ];
  }

  const where: Prisma.TradeListingWhereInput = side
    ? { ...baseWhere, side }
    : baseWhere;

  const [listings, total, sideGroups] = await Promise.all([
    prisma.tradeListing.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      include: {
        user: { select: { steamId: true, username: true, avatarUrl: true } },
        // Match the detail page's thread (deletedAt: null) — soft-deleted
        // comments must not inflate the reply count shown on the card.
        _count: { select: { comments: { where: { deletedAt: null } } } },
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
    }),
    prisma.tradeListing.count({ where }),
    // Chip counts honor ?q but not ?side, so each chip shows its own total
    // across the whole (search-filtered) board — not just the current page.
    prisma.tradeListing.groupBy({
      by: ["side"],
      where: baseWhere,
      _count: { _all: true },
    }),
  ]);

  const counts: SideCounts = { all: 0, selling: 0, buying: 0, both: 0 };
  for (const g of sideGroups) {
    const key = g.side;
    if (key === "selling" || key === "buying" || key === "both") {
      counts[key] = g._count._all;
      counts.all += g._count._all;
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const board: OfferListing[] = listings.map((l) => ({
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

  const filtered = q.length > 0 || side !== "";

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

      {/* market coming-soon banner */}
      <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[18px] border border-accent/30 bg-accent/10 px-5 py-4">
        <Sparkles className="h-5 w-5 shrink-0 text-accent" />
        <span className="rounded-full bg-accent px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
          Coming soon
        </span>
        <p className="text-[13.5px] text-mut">
          <span className="font-semibold text-tx">A real-money marketplace is on the way</span> — buy
          and sell S&amp;box skins for USDC with escrow protection, next-day seller payouts, and a
          low fee. The trading board stays free.
        </p>
      </div>

      {/* search + side chips (client → URL searchParams) */}
      <TradeControls q={q} side={side} counts={counts} />

      {/* offer grid */}
      {board.length === 0 ? (
        <div className="rounded-[18px] border border-line bg-panel p-12 text-center">
          <ArrowRightLeft className="mx-auto mb-3 h-9 w-9 text-faint/60" />
          <p className="text-sm text-mut">
            {filtered
              ? "No trades match your search."
              : "No active trades yet — be the first to post one!"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {board.map((l) => (
            <OfferCard key={l.id} listing={l} />
          ))}
        </div>
      )}

      {/* pagination */}
      {totalPages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-3">
          <PageLink page={page - 1} disabled={page <= 1} q={q} side={side}>
            <ChevronLeft className="h-4 w-4" />
            Prev
          </PageLink>
          <span className="font-mono text-[13px] text-mut">
            Page {page} of {totalPages}
          </span>
          <PageLink
            page={page + 1}
            disabled={page >= totalPages}
            q={q}
            side={side}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </PageLink>
        </div>
      )}
    </div>
  );
}

/** Prev/Next pagination link that preserves the active ?q and ?side filters. */
function PageLink({
  page,
  disabled,
  q,
  side,
  children,
}: {
  page: number;
  disabled: boolean;
  q: string;
  side: string;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <span className="inline-flex h-9 cursor-not-allowed items-center gap-1.5 rounded-[11px] border border-line2 px-4 text-[13px] font-semibold text-faint opacity-50">
        {children}
      </span>
    );
  }
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (side) params.set("side", side);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return (
    <Link
      href={`/trade${qs ? `?${qs}` : ""}`}
      className="inline-flex h-9 items-center gap-1.5 rounded-[11px] border border-line bg-panel px-4 text-[13px] font-semibold text-tx transition-colors hover:bg-bg2 hover:[border-color:#3a3547]"
    >
      {children}
    </Link>
  );
}
