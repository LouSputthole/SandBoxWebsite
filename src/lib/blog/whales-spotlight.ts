import { prisma } from "@/lib/db";

/**
 * Picks one item for this issue's "Whale Spotlight" section — the big
 * holder worth calling out. Rotates through the catalog so we don't
 * spotlight the same skin every week: we exclude items whose slug
 * appeared in the last 4 published newsletter-style posts (weekly-report
 * or monday-outlook) and then rank what's left by the top-1 holder's
 * share of total supply.
 *
 * Returns null if no item qualifies — Claude/caller falls back to a
 * generic "market overview" paragraph instead of a spotlight.
 */

export interface WhaleSpotlight {
  item: {
    name: string;
    slug: string;
    currentPrice: number | null;
    totalSupply: number | null;
    uniqueOwners: number | null;
  };
  /** Top holder's count, from the topHolders JSON on Item. */
  topHolderCount: number;
  /** Top holder's share of total supply, 0–1. */
  topHolderShare: number;
  /** How many of the top-10 holders each control 5+ units — a rough
   *  "how many whales" tally for the skin. */
  whaleCount: number;
  /** Top-10 list, lightly sanitized (names/ids removed; we only
   *  publish counts so we're not doxxing Steam profiles). */
  topHoldings: number[];
}

export async function pickWhaleSpotlight(): Promise<WhaleSpotlight | null> {
  // Pull slugs we've spotlighted in the last 4 reports (prevents repeats).
  const recent = await prisma.blogPost.findMany({
    where: { kind: { in: ["weekly-report", "monday-outlook"] } },
    orderBy: { publishedAt: "desc" },
    take: 4,
    select: { content: true },
  });
  // Scan bodies for "whale spotlight: [Name](/items/<slug>)" — we emit
  // that exact shape below, so the parser doesn't need to be clever.
  const recentlySpotlighted = new Set<string>();
  for (const post of recent) {
    const matches = post.content.matchAll(
      /whale spotlight:[^(]*\(\/items\/([a-z0-9-]+)\)/gi,
    );
    for (const m of matches) recentlySpotlighted.add(m[1]);
  }

  // Candidate items: have topHolders data AND known totalSupply.
  const items = await prisma.item.findMany({
    where: {
      topHolders: { not: undefined },
      totalSupply: { gt: 0 },
    },
    select: {
      name: true,
      slug: true,
      currentPrice: true,
      totalSupply: true,
      uniqueOwners: true,
      topHolders: true,
    },
  });

  let best: WhaleSpotlight | null = null;
  let bestShare = 0;

  for (const item of items) {
    if (recentlySpotlighted.has(item.slug)) continue;
    if (!item.topHolders || !item.totalSupply) continue;

    let holders: Array<{ count?: number; amount?: number }> = [];
    try {
      const raw = item.topHolders as unknown;
      if (Array.isArray(raw)) {
        holders = raw as Array<{ count?: number; amount?: number }>;
      }
    } catch {
      continue;
    }
    if (holders.length === 0) continue;

    const counts = holders
      .map((h) => h.count ?? h.amount ?? 0)
      .filter((n) => n > 0);
    if (counts.length === 0) continue;

    const topCount = counts[0];
    const share = topCount / item.totalSupply;
    // Threshold: top-1 holds at least 8% of supply. Below that, "whale"
    // is a stretch — don't spotlight just because it's the best we have.
    if (share < 0.08) continue;
    // Also require at least 2 meaningful holders (5+ units each) so the
    // spotlight doesn't land on an item held by one person.
    const whaleCount = counts.filter((c) => c >= 5).length;
    if (whaleCount < 2) continue;

    if (share > bestShare) {
      bestShare = share;
      best = {
        item: {
          name: item.name,
          slug: item.slug,
          currentPrice: item.currentPrice ?? null,
          totalSupply: item.totalSupply ?? null,
          uniqueOwners: item.uniqueOwners ?? null,
        },
        topHolderCount: topCount,
        topHolderShare: share,
        whaleCount,
        topHoldings: counts.slice(0, 10),
      };
    }
  }

  return best;
}
