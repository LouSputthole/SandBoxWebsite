import { prisma } from "@/lib/db";
import { formatPrice } from "@/lib/utils";
import { scoreAllItems } from "@/lib/market/momentum";
import { pickWhaleSpotlight } from "./whales-spotlight";
import { writeMondayNarrative } from "./narrative";

/**
 * Monday forward-looking outlook. Paired with the Friday weekly wrap.
 * Where Friday is "what happened", Monday is "what we think plays out
 * this week, based on the signals we're seeing". Publishes as a
 * BlogPost (kind = "monday-outlook") AND is queued for newsletter
 * delivery to subscribers on the "monday-outlook" list.
 *
 * Idempotent on slug: one post per ISO week. Slug lives in its own
 * namespace from weekly-report so Friday/Monday issues coexist.
 */
export async function generateAndSaveMondayOutlook(): Promise<{
  created: boolean;
  slug: string;
  title: string;
}> {
  const now = new Date();
  const { year, week } = getIsoWeek(now);
  const slug = `monday-outlook-${year}-w${String(week).padStart(2, "0")}`;

  const existing = await prisma.blogPost.findUnique({ where: { slug } });
  if (existing) {
    return { created: false, slug, title: existing.title };
  }

  const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const [scored, newestSnap, oldSnap, whale, totalItemsCount] =
    await Promise.all([
      scoreAllItems(),
      prisma.marketSnapshot.findFirst({ orderBy: { timestamp: "desc" } }),
      prisma.marketSnapshot.findFirst({
        where: { timestamp: { lte: d7 } },
        orderBy: { timestamp: "desc" },
      }),
      pickWhaleSpotlight(),
      prisma.item.count(),
    ]);

  const marketCapChange7d =
    oldSnap && newestSnap && oldSnap.listingsValue > 0
      ? ((newestSnap.listingsValue - oldSnap.listingsValue) /
          oldSnap.listingsValue) *
        100
      : null;

  const topMomentum = scored.filter((s) => s.momentumScore > 0).slice(0, 8);

  const unusualVolume = scored
    .filter((s) => (s.signals.volumeSurgeX ?? 0) >= 1.75)
    .sort(
      (a, b) =>
        (b.signals.volumeSurgeX ?? 0) - (a.signals.volumeSurgeX ?? 0),
    )
    .slice(0, 5)
    .map((s) => ({
      name: s.name,
      slug: s.slug,
      surgeX: s.signals.volumeSurgeX ?? 0,
    }));

  const contractingSupply = scored
    .filter((s) => (s.signals.supplyChange7dPct ?? 0) <= -5)
    .sort(
      (a, b) =>
        (a.signals.supplyChange7dPct ?? 0) -
        (b.signals.supplyChange7dPct ?? 0),
    )
    .slice(0, 5)
    .map((s) => ({
      name: s.name,
      slug: s.slug,
      changePct: s.signals.supplyChange7dPct ?? 0,
    }));

  const body = await writeMondayNarrative({
    date: now.toISOString().slice(0, 10),
    totalItems: totalItemsCount,
    marketCapChange7d,
    topMomentum: topMomentum.map((s) => ({
      name: s.name,
      slug: s.slug,
      momentumScore: s.momentumScore,
      currentPrice: s.currentPrice,
      rationale: s.rationale,
    })),
    unusualVolume,
    contractingSupply,
    whaleSpotlight: whale
      ? {
          name: whale.item.name,
          slug: whale.item.slug,
          topHolderShare: whale.topHolderShare,
          whaleCount: whale.whaleCount,
        }
      : null,
  });

  const title = `The Week Ahead — Week ${week}, ${year}`;
  const excerpt =
    topMomentum.length > 0
      ? `Six items with converging momentum signals this week — led by ${topMomentum[0].name} at score ${topMomentum[0].momentumScore.toFixed(0)}/100.`
      : `Our forward-looking read on the S&box skin market for Week ${week}.`;

  const whaleBlock = whale
    ? `\n\n## Whale Spotlight\n\n**Whale spotlight: [${whale.item.name}](/items/${whale.item.slug})** — one holder controls **${whale.topHolderCount}** units (${(whale.topHolderShare * 100).toFixed(1)}% of supply). ${whale.whaleCount} total whales in the top 10. When float is this concentrated, price moves on small accumulation — watch the order book.\n\nTop-10 holdings: ${whale.topHoldings.join(", ")}.`
    : "";

  const momentumTable = topMomentum
    .map((s, i) => {
      const price =
        s.currentPrice != null ? ` · ${formatPrice(s.currentPrice)}` : "";
      return `${i + 1}. [${s.name}](/items/${s.slug}) — **${s.momentumScore.toFixed(1)}**${price}`;
    })
    .join("\n");

  const fallback =
    body ??
    `This week we're watching a handful of items where multiple signals converge — price trend, volume, supply contraction, and holder concentration all pointing the same direction. Full ranking:\n\n${momentumTable}\n\nNo single item has all signals firing, but the top of this list is where the asymmetric setups sit. Nothing here is a trade recommendation — these are observations from the data.`;

  const md = `${fallback}

## Full Momentum Ranking

${momentumTable || "_Not enough signal data yet — need another day or two of history._"}
${whaleBlock}

---

_This is our forward-looking take, not a trade recommendation. Published Mondays; the Friday companion wraps up what actually happened. [Subscribe](/#newsletter) to get both in your inbox._`;

  const post = await prisma.blogPost.create({
    data: { slug, title, excerpt, content: md, kind: "monday-outlook" },
  });

  return { created: true, slug: post.slug, title: post.title };
}

function getIsoWeek(date: Date): { year: number; week: number } {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  return { year: d.getUTCFullYear(), week };
}
