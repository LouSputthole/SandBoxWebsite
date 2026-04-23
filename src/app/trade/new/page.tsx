import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { ArrowLeft } from "lucide-react";
import { NewListingForm } from "./form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "New trade listing",
  description: "Post a new S&box trade listing on the trading board.",
  robots: { index: false, follow: false },
};

export default async function NewTradeListingPage() {
  const user = await getCurrentUser();
  if (!user) {
    // Pass next= so the Steam callback bounces them right back here after
    // login — otherwise they'd have to click "New listing" a second time.
    redirect(`/api/auth/steam?next=${encodeURIComponent("/trade/new")}`);
  }

  // Slim catalog payload for the autocomplete picker. 1.6KB per 100 items
  // is fine to inline; with ~80 items in the catalog this is well under
  // network-noise size and saves a round-trip when the user starts typing.
  const items = await prisma.item.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      imageUrl: true,
      type: true,
      currentPrice: true,
    },
    orderBy: { currentPrice: "desc" },
  });

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8 py-8">
      <Link
        href="/trade"
        className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-white transition-colors mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to trading board
      </Link>

      <h1 className="text-2xl font-bold text-white mb-1">New trade listing</h1>
      <p className="text-sm text-neutral-500 mb-6">
        Listings stay on the board for 14 days by default and connect interested traders to you on Steam.
      </p>

      <NewListingForm
        catalog={items}
        steamId={user.steamId}
        hasTradeUrl={!!user.steamTradeUrl}
        existingTradeUrl={user.steamTradeUrl ?? null}
      />
    </div>
  );
}
