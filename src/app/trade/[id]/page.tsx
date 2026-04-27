import Link from "next/link";
import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { ItemImage } from "@/components/items/item-image";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/utils";
import { getCurrentUser } from "@/lib/auth/session";
import { ArrowLeft, ExternalLink, Clock, Eye } from "lucide-react";
import { OwnerActions } from "./owner-actions";
import { CommentsThread, type ThreadComment } from "./comments-thread";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

// Cached so generateMetadata + the page component share one DB hit
// per request (AGENTS.md #6).
const getListing = cache(async (id: string) =>
  prisma.tradeListing.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          id: true,
          steamId: true,
          username: true,
          avatarUrl: true,
          steamTradeUrl: true,
        },
      },
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
              lowestPrice: true,
            },
          },
        },
      },
    },
  }),
);

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const listing = await getListing(id);
  if (!listing) return { title: "Trade not found" };
  const username = listing.user.username ?? "Anonymous";
  const sideText =
    listing.side === "selling" ? "Selling" : listing.side === "buying" ? "Buying" : "Trading";
  return {
    title: `${username}'s ${sideText} listing`,
    description: listing.description.slice(0, 160),
    alternates: { canonical: `/trade/${id}` },
    robots:
      listing.status === "active"
        ? { index: true, follow: true }
        : { index: false, follow: true },
  };
}

const STATUS_TONE: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  completed: "bg-neutral-500/20 text-neutral-300 border-neutral-700",
  cancelled: "bg-neutral-500/20 text-neutral-400 border-neutral-700",
  expired: "bg-amber-500/15 text-amber-300 border-amber-500/30",
};

const SIDE_LABEL: Record<string, string> = {
  selling: "Selling",
  buying: "Buying",
  both: "Item ↔ item",
};

export default async function TradeListingPage({ params }: PageProps) {
  const { id } = await params;
  const [listing, currentUser, commentRows] = await Promise.all([
    getListing(id),
    getCurrentUser(),
    prisma.tradeComment.findMany({
      where: { listingId: id, deletedAt: null },
      orderBy: { createdAt: "asc" },
      include: {
        user: {
          select: {
            id: true,
            steamId: true,
            username: true,
            avatarUrl: true,
          },
        },
      },
    }),
  ]);
  if (!listing) notFound();

  const initialComments: ThreadComment[] = commentRows.map((c) => ({
    id: c.id,
    body: c.body,
    createdAt: c.createdAt.toISOString(),
    user: c.user,
  }));

  // Fire-and-forget viewCount bump. Don't block render. Skip if the viewer
  // is the listing owner — their visits don't count toward "interest."
  if (currentUser?.id !== listing.userId) {
    prisma.tradeListing
      .update({ where: { id }, data: { viewCount: { increment: 1 } } })
      .catch(() => {});
  }

  const offering = listing.items.filter((i) => i.slot === "offering");
  const wanting = listing.items.filter((i) => i.slot === "wanting");
  const offeringValue = offering.reduce(
    (sum, li) =>
      sum + (li.unitPriceAtListing ?? li.item?.currentPrice ?? 0) * li.quantity,
    0,
  );
  const wantingValue = wanting.reduce(
    (sum, li) =>
      sum + (li.unitPriceAtListing ?? li.item?.currentPrice ?? 0) * li.quantity,
    0,
  );

  const isOwner = currentUser?.id === listing.userId;
  const tradeable = listing.status === "active" && !!listing.user.steamTradeUrl;

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-8">
      <Link
        href="/trade"
        className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-white transition-colors mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to trading board
      </Link>

      <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-5 mb-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            {listing.user.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={listing.user.avatarUrl}
                alt=""
                className="h-10 w-10 rounded-full border border-neutral-700"
              />
            ) : (
              <div className="h-10 w-10 rounded-full bg-neutral-800" />
            )}
            <div className="min-w-0">
              <a
                href={`https://steamcommunity.com/profiles/${listing.user.steamId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-base font-semibold text-white hover:text-purple-300 transition-colors inline-flex items-center gap-1"
              >
                {listing.user.username ?? "Anonymous"}
                <ExternalLink className="h-3 w-3 text-neutral-500" />
              </a>
              <div className="flex items-center gap-3 text-[11px] text-neutral-500 mt-0.5">
                <span>Posted {listing.createdAt.toLocaleString()}</span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Expires {listing.expiresAt.toLocaleDateString()}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Eye className="h-3 w-3" />
                  {listing.viewCount.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
          <span
            className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-full font-semibold border ${
              STATUS_TONE[listing.status] ?? "bg-neutral-800 text-neutral-300 border-neutral-700"
            }`}
          >
            {listing.status}
          </span>
        </div>

        {/* CTA + side badge */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {tradeable && !isOwner && (
            <a
              href={listing.user.steamTradeUrl ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button className="bg-purple-600 hover:bg-purple-700 text-white gap-2">
                <ExternalLink className="h-4 w-4" />
                Open trade on Steam
              </Button>
            </a>
          )}
          <span className="text-xs uppercase tracking-wider text-neutral-500">
            {SIDE_LABEL[listing.side] ?? listing.side}
          </span>
          {isOwner && listing.status === "active" && (
            <OwnerActions id={listing.id} />
          )}
        </div>

        {/* Description */}
        {listing.description && (
          <div className="rounded-lg bg-neutral-950/50 border border-neutral-800 px-3 py-2 mb-4">
            <p className="text-sm text-neutral-200 whitespace-pre-wrap leading-relaxed">
              {listing.description}
            </p>
          </div>
        )}

        {/* Value summary */}
        <div className="grid grid-cols-2 gap-3 text-center">
          <div className="rounded-lg bg-neutral-950/40 border border-neutral-800 py-2">
            <div className="text-[10px] uppercase tracking-wider text-emerald-400 font-semibold">
              Offering value
            </div>
            <div className="text-lg font-bold text-white">
              {offeringValue > 0 ? formatPrice(offeringValue) : "—"}
            </div>
          </div>
          <div className="rounded-lg bg-neutral-950/40 border border-neutral-800 py-2">
            <div className="text-[10px] uppercase tracking-wider text-blue-400 font-semibold">
              Wants value
            </div>
            <div className="text-lg font-bold text-white">
              {wantingValue > 0 ? formatPrice(wantingValue) : "—"}
            </div>
          </div>
        </div>
      </div>

      {/* Item lists */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ItemList
          label="Offering"
          tone="emerald"
          items={offering.map((it) => ({
            id: it.id,
            quantity: it.quantity,
            unitPriceAtListing: it.unitPriceAtListing,
            item: it.item,
            customName: it.customName,
          }))}
        />
        <ItemList
          label="Wants"
          tone="blue"
          items={wanting.map((it) => ({
            id: it.id,
            quantity: it.quantity,
            unitPriceAtListing: it.unitPriceAtListing,
            item: it.item,
            customName: it.customName,
          }))}
        />
      </div>

      <CommentsThread
        listingId={listing.id}
        initialComments={initialComments}
        currentUserId={currentUser?.id ?? null}
      />
    </div>
  );
}

interface ItemListProps {
  label: string;
  tone: "emerald" | "blue";
  items: {
    id: string;
    quantity: number;
    unitPriceAtListing: number | null;
    customName: string | null;
    item: {
      id: string;
      name: string;
      slug: string;
      imageUrl: string | null;
      type: string;
      currentPrice: number | null;
    } | null;
  }[];
}

function ItemList({ label, tone, items }: ItemListProps) {
  const toneClass = tone === "emerald" ? "text-emerald-400" : "text-blue-400";
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
      <div className={`text-[11px] uppercase tracking-wider font-semibold ${toneClass} mb-3`}>
        {label}
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-neutral-500 italic">See description</p>
      ) : (
        <div className="space-y-2">
          {items.map((li) => {
            const price = li.unitPriceAtListing ?? li.item?.currentPrice ?? null;
            const totalPrice = price !== null ? price * li.quantity : null;
            const inner = (
              <>
                <div className="h-10 w-10 rounded-md border border-neutral-700 overflow-hidden shrink-0 bg-neutral-950">
                  {li.item ? (
                    <ItemImage
                      src={li.item.imageUrl}
                      name={li.item.name}
                      type={li.item.type}
                      size="sm"
                      className="h-full w-full"
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-[9px] text-neutral-500">
                      —
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white truncate">
                    {li.item?.name ?? li.customName ?? "Unknown item"}
                  </div>
                  <div className="text-[11px] text-neutral-500">
                    {li.quantity > 1 ? `×${li.quantity}` : "×1"}
                    {price !== null && ` · ${formatPrice(price)} ea`}
                  </div>
                </div>
                {totalPrice !== null && (
                  <div className="text-sm font-semibold text-white shrink-0">
                    {formatPrice(totalPrice)}
                  </div>
                )}
              </>
            );
            return li.item ? (
              <Link
                key={li.id}
                href={`/items/${li.item.slug}`}
                className="flex items-center gap-3 rounded-lg bg-neutral-950/40 border border-neutral-800 hover:border-neutral-700 px-3 py-2 transition-colors"
              >
                {inner}
              </Link>
            ) : (
              <div
                key={li.id}
                className="flex items-center gap-3 rounded-lg bg-neutral-950/40 border border-neutral-800 px-3 py-2"
              >
                {inner}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
