import Link from "next/link";
import { Star } from "lucide-react";
import { SkinTile } from "@/components/items/skin-tile";
import { rarityCssColor, rarityLabel } from "@/lib/rarity";
import type { getActiveListings } from "@/lib/market/listing-service";
import type { SellerRep } from "@/lib/market/profile-service";

type Listing = Awaited<ReturnType<typeof getActiveListings>>[number];

export function MarketListingCard({ listing, rep }: { listing: Listing; rep?: SellerRep }) {
  const { item } = listing;
  const rarity = rarityLabel(item.rarityColor);

  return (
    <Link
      href={`/market/${listing.id}`}
      className="group block rounded-2xl border border-line bg-panel p-3 transition-colors hover:border-accent/60"
    >
      <SkinTile
        imageUrl={item.imageUrl}
        name={item.name}
        type={item.type}
        rarityColor={rarityCssColor(item.rarityColor)}
        badge={
          rarity ? (
            <span className="rounded-md bg-bg/70 px-1.5 py-0.5 text-[10px] font-medium text-tx backdrop-blur">
              {rarity}
            </span>
          ) : undefined
        }
      />
      <div className="mt-3 space-y-1">
        <div className="truncate text-sm font-medium text-tx">{item.name}</div>
        <div className="flex items-baseline justify-between">
          <span className="font-mono text-base font-semibold text-accent">
            ${listing.priceUsd.toFixed(2)}
          </span>
          <span className="truncate text-xs text-mut">
            {listing.seller.username ?? "anonymous"}
          </span>
        </div>
        {/* one-line seller rep (batched groupBy upstream — no N+1) */}
        {rep && (rep.reviewCount > 0 || rep.completedSales > 0) ? (
          <div className="flex items-center gap-1 text-[11px] text-faint">
            {rep.avgStars !== null ? (
              <>
                <Star className="h-3 w-3 text-accent" fill="currentColor" strokeWidth={0} />
                <span className="text-mut">{rep.avgStars.toFixed(1)}</span>
                <span aria-hidden>·</span>
              </>
            ) : null}
            <span>{rep.completedSales} {rep.completedSales === 1 ? "sale" : "sales"}</span>
          </div>
        ) : null}
      </div>
    </Link>
  );
}
