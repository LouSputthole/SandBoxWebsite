import type { Metadata } from "next";
import { Sparkles } from "lucide-react";
import { prisma } from "@/lib/db";
import { NewDropCard, type NewDropItem } from "@/components/items/new-drop-card";

export const metadata: Metadata = {
  title: "New S&box Skins — Latest Drops",
  description:
    "The newest S&box Steam skins, freshly added to the tracker over the last 30 days. Live prices, supply, and buy/sell order books as each new drop comes online.",
  alternates: { canonical: "/new" },
  openGraph: {
    title: "New S&box Skins — Latest Drops",
    description:
      "The newest S&box Steam cosmetics added in the last 30 days, newest first.",
  },
};

// Render per request — the table is tiny, the "syncing/pending" badges should
// reflect the live backfill state, and this avoids a build-time DB dependency.
// (Same approach as /store.)
export const dynamic = "force-dynamic";

const WINDOW_DAYS = 30;

// Helper keeps Date.now() out of the component render body (react-hooks/purity).
function windowStart(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export default async function NewDropsPage() {
  const since = windowStart(WINDOW_DAYS);

  const items = (await prisma.item.findMany({
    // Hide the internal QA Team T-Shirt (non-marketable, granted-manually) —
    // it's kept in the catalog but isn't a real "drop".
    where: { createdAt: { gte: since }, slug: { not: "qa-team-t-shirt" } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      slug: true,
      type: true,
      imageUrl: true,
      currentPrice: true,
      priceChange24h: true,
      volume: true,
      isLimited: true,
      createdAt: true,
      steamItemNameId: true,
      rarityColor: true,
    },
  })) as NewDropItem[];

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="h-5 w-5 text-purple-400" />
          <h1 className="text-2xl font-bold text-white">New Drops</h1>
        </div>
        <p className="text-sm text-neutral-400 max-w-2xl leading-relaxed">
          The newest S&box skins to land in the tracker, newest first — added in
          the last {WINDOW_DAYS} days. Fresh drops take a little while to fully
          sync; prices and buy/sell order books fill in automatically as each
          one comes online.
        </p>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-neutral-500">
          <p className="text-lg">No new drops in the last {WINDOW_DAYS} days</p>
          <p className="text-sm mt-1">
            Check back soon — the S&box store rotates regularly.
          </p>
        </div>
      ) : (
        <>
          <p className="text-sm text-neutral-500 mb-4">
            {items.length} new {items.length === 1 ? "drop" : "drops"}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {items.map((item) => (
              <NewDropCard key={item.id} item={item} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
