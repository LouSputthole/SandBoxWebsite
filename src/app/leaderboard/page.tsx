import Link from "next/link";
import { Flame, TrendingUp, TrendingDown } from "lucide-react";
import { ItemImage } from "@/components/items/item-image";
import { LeaderboardTabSwitcher, tabs, type LeaderboardTab } from "@/components/leaderboard/tab-switcher";
import { prisma } from "@/lib/db";
import { formatPrice, formatPriceChange } from "@/lib/utils";
import type { Prisma } from "@/generated/prisma/client";

// ISR — leaderboard data changes every sync (15-30 min). Caching the rendered
// HTML for 5 min keeps Googlebot fed without slamming the DB.
export const revalidate = 300;

interface PageProps {
  searchParams: Promise<{ tab?: string }>;
}

interface Item {
  id: string;
  name: string;
  slug: string;
  type: string;
  imageUrl: string | null;
  currentPrice: number | null;
  priceChange24h: number | null;
  volume: number | null;
}

const validTabs = new Set<string>(tabs.map((t) => t.key));

function isValidTab(s: string | undefined): s is LeaderboardTab {
  return s !== undefined && validTabs.has(s);
}

async function getLeaderboard(tab: LeaderboardTab): Promise<Item[]> {
  // Build the where + orderBy based on the tab. Each tab has a slightly
  // different filter so we don't show 0-priced or change=0 items at the top.
  let where: Prisma.ItemWhereInput = {};
  let orderBy: Prisma.ItemOrderByWithRelationInput = {};

  switch (tab) {
    case "expensive":
      where = { currentPrice: { not: null, gt: 0 } };
      orderBy = { currentPrice: "desc" };
      break;
    case "gainers":
      where = { priceChange24h: { gt: 0 } };
      orderBy = { priceChange24h: "desc" };
      break;
    case "losers":
      where = { priceChange24h: { lt: 0 } };
      orderBy = { priceChange24h: "asc" };
      break;
    case "popular":
      where = { volume: { gt: 0 } };
      orderBy = { volume: "desc" };
      break;
  }

  return prisma.item.findMany({
    where,
    orderBy,
    take: 25,
    select: {
      id: true,
      name: true,
      slug: true,
      type: true,
      imageUrl: true,
      currentPrice: true,
      priceChange24h: true,
      volume: true,
    },
  });
}

export default async function LeaderboardPage({ searchParams }: PageProps) {
  const { tab: rawTab } = await searchParams;
  const tab: LeaderboardTab = isValidTab(rawTab) ? rawTab : "expensive";

  const items = await getLeaderboard(tab);
  const showChange = tab === "gainers" || tab === "losers" || tab === "expensive";
  const showVolume = tab === "popular" || tab === "expensive";

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-amber-500/10">
            <Flame className="h-5 w-5 text-amber-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">Leaderboard</h1>
        </div>
        <p className="text-sm text-neutral-500">
          Top S&box skins ranked by price, gains, losses, and popularity.
        </p>
      </div>

      <LeaderboardTabSwitcher active={tab} />

      <div className="overflow-x-auto rounded-xl border border-neutral-800 bg-neutral-900/30">
        <table className="w-full">
          <thead className="border-b border-neutral-800 bg-neutral-900/50">
            <tr>
              <th className="w-12 px-4 py-3 text-xs font-medium text-neutral-500 text-center">#</th>
              <th className="px-4 py-3 text-xs font-medium text-neutral-500 text-left uppercase tracking-wider">Item</th>
              <th className="px-4 py-3 text-xs font-medium text-neutral-500 text-right uppercase tracking-wider">Price</th>
              {showChange && (
                <th className="px-4 py-3 text-xs font-medium text-neutral-500 text-right uppercase tracking-wider">24h Change</th>
              )}
              {showVolume && (
                <th className="px-4 py-3 text-xs font-medium text-neutral-500 text-right uppercase tracking-wider">Listings</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800/50">
            {items.length === 0 ? (
              <tr>
                <td
                  colSpan={2 + (showChange ? 1 : 0) + (showVolume ? 1 : 0) + 1}
                  className="px-4 py-8 text-center text-sm text-neutral-500"
                >
                  No items in this category yet.
                </td>
              </tr>
            ) : (
              items.map((item, i) => {
                const change = item.priceChange24h ?? 0;
                return (
                  <tr key={item.id} className="hover:bg-neutral-800/30 transition-colors">
                    <td className="px-4 py-3 text-center">
                      {i < 3 ? (
                        <span
                          className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${
                            i === 0
                              ? "bg-amber-500/20 text-amber-400"
                              : i === 1
                                ? "bg-neutral-400/20 text-neutral-300"
                                : "bg-orange-500/20 text-orange-400"
                          }`}
                        >
                          {i + 1}
                        </span>
                      ) : (
                        <span className="text-xs text-neutral-600">{i + 1}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/items/${item.slug}`} className="flex items-center gap-3 group">
                        <ItemImage
                          src={item.imageUrl}
                          name={item.name}
                          type={item.type}
                          size="sm"
                          className="h-10 w-10 rounded-lg border border-neutral-700/50 shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-neutral-100 group-hover:text-white truncate">
                            {item.name}
                          </p>
                          <p className="text-[10px] text-neutral-500 capitalize">{item.type}</p>
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm font-semibold text-white">
                        {item.currentPrice != null ? formatPrice(item.currentPrice) : "—"}
                      </span>
                    </td>
                    {showChange && (
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          {change > 0 ? (
                            <TrendingUp className="h-3 w-3 text-emerald-400" />
                          ) : change < 0 ? (
                            <TrendingDown className="h-3 w-3 text-red-400" />
                          ) : null}
                          <span
                            className={`text-sm font-medium ${
                              change > 0
                                ? "text-emerald-400"
                                : change < 0
                                  ? "text-red-400"
                                  : "text-neutral-500"
                            }`}
                          >
                            {formatPriceChange(change)}
                          </span>
                        </div>
                      </td>
                    )}
                    {showVolume && (
                      <td className="px-4 py-3 text-right text-sm text-neutral-400">
                        {item.volume != null ? item.volume.toLocaleString() : "—"}
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
