import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ShieldCheck, Send, Clock, ExternalLink, User as UserIcon } from "lucide-react";
import { prisma } from "@/lib/db";
import { SkinTile } from "@/components/items/skin-tile";
import { Stars } from "@/components/market/stars";
import { rarityCssColor, rarityLabel } from "@/lib/rarity";
import { loadProfileStats } from "@/lib/market/profile-service";
import { formatDuration } from "@/lib/market/profile-stats";
import { BuyPanel } from "./buy-panel";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const STEPS = [
  { icon: ShieldCheck, text: "You pay in USDC — held in on-chain escrow, never by us." },
  { icon: Send, text: "The seller sends the skin directly to you on Steam." },
  { icon: Clock, text: "After a 24-hour dispute window, the seller is paid out." },
];

export default async function ListingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const listing = await prisma.marketListing.findUnique({
    where: { id },
    include: { item: true, seller: { select: { id: true, username: true, avatarUrl: true, steamId: true } } },
  });
  if (!listing) notFound();

  const { item } = listing;
  const rarity = rarityLabel(item.rarityColor);
  const isActive = listing.status === "ACTIVE";

  // Compact seller reputation strip (rep surfacing — the CS2-marketplace trust loop).
  const sellerStats = await loadProfileStats(listing.seller.id);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <Link href="/market" className="mb-6 inline-flex items-center gap-1.5 text-sm text-mut hover:text-tx">
        <ArrowLeft className="h-4 w-4" /> Marketplace
      </Link>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        <div>
          <SkinTile
            imageUrl={item.imageUrl}
            name={item.name}
            type={item.type}
            rarityColor={rarityCssColor(item.rarityColor)}
            className="max-w-sm"
          />
          <div className="mt-4">
            <div className="flex items-center gap-2">
              <h1 className="font-display text-2xl font-semibold text-tx">{item.name}</h1>
              {rarity ? (
                <span className="rounded-md border border-line px-2 py-0.5 text-xs text-mut">{rarity}</span>
              ) : null}
            </div>
          </div>

          {/* seller rep strip */}
          <Link
            href={`/market/u/${listing.seller.steamId}`}
            className="mt-4 flex items-center gap-3 rounded-xl border border-line bg-panel p-3 transition-colors hover:border-accent/60"
          >
            {listing.seller.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- Steam avatar host isn't in next/image config
              <img
                src={listing.seller.avatarUrl}
                alt=""
                className="h-10 w-10 shrink-0 rounded-full border border-line object-cover"
              />
            ) : (
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line bg-bg2">
                <UserIcon className="h-5 w-5 text-mut" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 truncate text-sm font-medium text-tx">
                {listing.seller.username ?? "Anonymous seller"}
                <ExternalLink className="h-3 w-3 shrink-0 text-faint" />
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-mut">
                {sellerStats.ratings.count > 0 && sellerStats.ratings.average !== null ? (
                  <span className="inline-flex items-center gap-1">
                    <Stars value={sellerStats.ratings.average} size={12} />
                    {sellerStats.ratings.average.toFixed(1)} ({sellerStats.ratings.count})
                  </span>
                ) : (
                  <span className="text-faint">New seller</span>
                )}
                <span aria-hidden>·</span>
                <span>{sellerStats.asSeller.completedSales} sales</span>
                {sellerStats.asSeller.avgResponseSeconds !== null ? (
                  <>
                    <span aria-hidden>·</span>
                    <span>~{formatDuration(sellerStats.asSeller.avgResponseSeconds)} to send</span>
                  </>
                ) : null}
              </div>
            </div>
          </Link>
        </div>

        <div className="space-y-5">
          {isActive ? (
            <BuyPanel listingId={listing.id} priceUsd={listing.priceUsd} listingUrl={`/market/${listing.id}`} />
          ) : (
            <div className="rounded-2xl border border-line bg-panel p-5 text-center">
              <p className="text-tx">This listing is no longer available.</p>
              <Link href="/market" className="mt-3 inline-flex text-sm font-medium text-accent hover:underline">
                Browse other skins
              </Link>
            </div>
          )}

          <div className="rounded-2xl border border-line bg-panel p-5">
            <h2 className="text-sm font-semibold text-tx">How the escrow works</h2>
            <ol className="mt-3 space-y-3">
              {STEPS.map(({ icon: Icon, text }, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-mut">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                  <span>{text}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </main>
  );
}
