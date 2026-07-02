import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck, Coins, Send, Plus, ScrollText } from "lucide-react";
import { getActiveListings } from "@/lib/market/listing-service";
import { loadSellerReps } from "@/lib/market/profile-service";
import { MarketListingCard } from "./_components/listing-card";

// v1: the crypto marketplace stays out of Google (grey-zone; protects the tracker's index).
export const metadata: Metadata = {
  title: "Marketplace — Buy & Sell S&box Skins for USDC",
  description:
    "Non-custodial peer-to-peer marketplace for S&box skins. Pay in USDC on Solana, escrow-protected, with a low fee.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const TRUST = [
  { icon: ShieldCheck, label: "Escrow-protected", note: "funds released only on confirmed delivery" },
  { icon: Coins, label: "Low fee", note: "a fraction of Steam's 15%" },
  { icon: Send, label: "Steam-native delivery", note: "traded on Steam's own rails" },
];

export default async function MarketPage() {
  const listings = await getActiveListings({ take: 60 });
  // Batched seller rep for the whole page in two groupBy queries (no per-card N+1).
  const reps = await loadSellerReps(listings.map((l) => l.seller.id));

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-semibold text-tx">Marketplace</h1>
            <p className="mt-1 max-w-2xl text-mut">
              Buy &amp; sell S&amp;box skins for <span className="text-tx">USDC on Solana</span>.
              Non-custodial escrow, <span className="text-tx">low fees</span>.
            </p>
          </div>
          <Link
            href="/market/sell"
            className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> List a skin
          </Link>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {TRUST.map(({ icon: Icon, label, note }) => (
            <div key={label} className="flex items-start gap-3 rounded-xl border border-line bg-panel px-3 py-2.5">
              <Icon className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
              <div>
                <div className="text-sm font-medium text-tx">{label}</div>
                <div className="text-xs text-mut">{note}</div>
              </div>
            </div>
          ))}
        </div>

        <Link
          href="/market/ledger"
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
        >
          <ScrollText className="h-4 w-4" /> Public ledger — every settled trade, on-chain
        </Link>
      </header>

      {listings.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-panel/50 px-6 py-16 text-center">
          <p className="text-tx">No active listings yet.</p>
          <p className="mt-1 text-sm text-mut">Be the first to list a skin.</p>
          <Link href="/market/sell" className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-accent hover:underline">
            <Plus className="h-4 w-4" /> List a skin
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {listings.map((listing) => (
            <MarketListingCard key={listing.id} listing={listing} rep={reps.get(listing.seller.id)} />
          ))}
        </div>
      )}
    </main>
  );
}
