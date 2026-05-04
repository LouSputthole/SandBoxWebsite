import Link from "next/link";
import type { Metadata } from "next";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { TradeListingCard } from "@/components/trade/listing-card";
import { TradeFeedFilters } from "./filters";
import { TradingHubBanner } from "@/components/trade/trading-hub-banner";
import { ArrowRightLeft, PlusCircle } from "lucide-react";

// Listings are dynamic per filter combination; let Next stream the page.
// We don't ISR because filtered queries vary too much to cache usefully.
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

interface PageProps {
  searchParams: Promise<{ q?: string; side?: string; page?: string }>;
}

const PAGE_SIZE = 20;

export default async function TradePage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const side = sp.side ?? "";
  const page = Math.max(1, Number(sp.page ?? "1"));

  const where: Prisma.TradeListingWhereInput = { status: "active" };
  if (side === "selling" || side === "buying" || side === "both") {
    where.side = side;
  }
  if (q.length > 0) {
    where.OR = [
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

  const [listings, total] = await Promise.all([
    prisma.tradeListing.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      include: {
        user: { select: { steamId: true, username: true, avatarUrl: true } },
        items: {
          include: {
            item: {
              select: {
                id: true,
                name: true,
                slug: true,
                imageUrl: true,
                type: true,
                currentPrice: true,
              },
            },
          },
        },
      },
    }),
    prisma.tradeListing.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <div className="inline-flex items-center gap-2 bg-purple-500/10 border border-purple-500/20 rounded-full px-3 py-1 mb-3">
            <ArrowRightLeft className="h-3.5 w-3.5 text-purple-400" />
            <span className="text-xs text-purple-300">Trading Board</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white">
            S&box Trading
          </h1>
          <p className="text-sm text-neutral-400 mt-1 max-w-xl">
            Public bulletin board for S&box trades. Post what you have, what you want, and connect with other traders directly through Steam. No fees, no escrow.
          </p>
        </div>
        <Link href="/trade/new">
          <Button className="bg-purple-600 hover:bg-purple-700 text-white gap-2">
            <PlusCircle className="h-4 w-4" />
            New listing
          </Button>
        </Link>
      </div>

      <TradeFeedFilters initialQ={q} initialSide={side} />

      <TradingHubBanner />

      {/* Results */}
      {listings.length === 0 ? (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-12 text-center">
          <ArrowRightLeft className="h-10 w-10 mx-auto mb-3 text-neutral-700" />
          <p className="text-sm text-neutral-400">
            {q || side
              ? "No active listings match your filters."
              : "No active listings yet. Be the first to post one!"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {listings.map((l) => (
            <TradeListingCard
              key={l.id}
              id={l.id}
              side={l.side}
              description={l.description}
              createdAt={l.createdAt.toISOString()}
              user={l.user}
              items={l.items.map((it) => ({
                id: it.id,
                slot: it.slot,
                itemId: it.itemId,
                customName: it.customName,
                quantity: it.quantity,
                unitPriceAtListing: it.unitPriceAtListing,
                item: it.item,
              }))}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-8">
          <PageLink
            page={page - 1}
            disabled={page <= 1}
            q={q}
            side={side}
            label="Previous"
          />
          <span className="text-sm text-neutral-500 px-3">
            Page {page} of {totalPages}
          </span>
          <PageLink
            page={page + 1}
            disabled={page >= totalPages}
            q={q}
            side={side}
            label="Next"
          />
        </div>
      )}
    </div>
  );
}

function PageLink({
  page,
  disabled,
  q,
  side,
  label,
}: {
  page: number;
  disabled: boolean;
  q: string;
  side: string;
  label: string;
}) {
  if (disabled) {
    return (
      <span className="px-3 py-1.5 text-sm text-neutral-700 cursor-not-allowed">
        {label}
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
      className="px-3 py-1.5 text-sm text-neutral-300 hover:text-white border border-neutral-800 hover:border-neutral-700 rounded-md transition"
    >
      {label}
    </Link>
  );
}
