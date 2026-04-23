import { prisma } from "@/lib/db";
import { formatPrice } from "@/lib/utils";

/**
 * Generates and persists a weekly market report as a BlogPost row.
 * Run weekly by a cron. Idempotent on slug — won't overwrite an existing
 * post for the same ISO week.
 */
export async function generateAndSaveWeeklyReport(): Promise<{
  created: boolean;
  slug: string;
  title: string;
}> {
  const now = new Date();
  const { year, week } = getIsoWeek(now);
  const slug = `weekly-report-${year}-w${String(week).padStart(2, "0")}`;

  // Idempotency: skip if we already have this week's post
  const existing = await prisma.blogPost.findUnique({ where: { slug } });
  if (existing) {
    return { created: false, slug, title: existing.title };
  }

  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Centered ±12h window around 7-day-ago — gives us tolerance for sync gaps
  const baselineStart = new Date(weekAgo.getTime() - 12 * 60 * 60 * 1000);
  const baselineEnd = new Date(weekAgo.getTime() + 12 * 60 * 60 * 1000);

  const [items, oldSnap, newestSnap, weekAgoPoints] = await Promise.all([
    prisma.item.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        currentPrice: true,
        priceChange24h: true,
        totalSupply: true,
        uniqueOwners: true,
        volume: true,
        scarcityScore: true,
      },
    }),
    prisma.marketSnapshot.findFirst({
      where: { timestamp: { lte: baselineEnd } },
      orderBy: { timestamp: "desc" },
    }),
    prisma.marketSnapshot.findFirst({ orderBy: { timestamp: "desc" } }),
    // Pull every price point in the ±12h window centered on 7 days ago.
    // We take the MEDIAN per item (not the single closest point) because
    // Steam's /market/search occasionally stores spurious sell_prices
    // during a sync. A single outlier at the baseline would blow up the
    // reported weekly change — we've seen +5000%+ tweets when the real
    // move was +20%. Median is robust to those one-offs.
    prisma.pricePoint.findMany({
      where: { timestamp: { gte: baselineStart, lte: baselineEnd } },
      select: { itemId: true, price: true },
    }),
  ]);

  // Median baseline price per item. Group all window points, sort, pick
  // middle. Skip items with zero-or-negative medians (shouldn't happen
  // but guards against division blow-ups downstream).
  const pointsByItem = new Map<string, number[]>();
  for (const p of weekAgoPoints) {
    const arr = pointsByItem.get(p.itemId) ?? [];
    arr.push(p.price);
    pointsByItem.set(p.itemId, arr);
  }
  const priceWeekAgo = new Map<string, number>();
  for (const [itemId, prices] of pointsByItem) {
    const sorted = [...prices].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median =
      sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];
    if (median > 0) priceWeekAgo.set(itemId, median);
  }

  // Compute 7-day change for each item that has both current + baseline
  const withWeeklyChange = items
    .map((i) => {
      const baseline = priceWeekAgo.get(i.id);
      const current = i.currentPrice ?? 0;
      if (!baseline || baseline <= 0 || current <= 0) return null;
      const changePct = ((current - baseline) / baseline) * 100;
      return { ...i, weeklyChangePct: changePct, weekAgoPrice: baseline };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const gainers = withWeeklyChange
    .filter((i) => i.weeklyChangePct > 0)
    .sort((a, b) => b.weeklyChangePct - a.weeklyChangePct)
    .slice(0, 5);
  const losers = withWeeklyChange
    .filter((i) => i.weeklyChangePct < 0)
    .sort((a, b) => a.weeklyChangePct - b.weeklyChangePct)
    .slice(0, 5);

  const currentListings = items.reduce(
    (s, i) => s + (i.currentPrice ?? 0) * (i.volume ?? 0),
    0,
  );
  const capChange =
    oldSnap && newestSnap && oldSnap.listingsValue > 0
      ? ((currentListings - oldSnap.listingsValue) / oldSnap.listingsValue) * 100
      : null;

  const totalItems = items.length;
  const rarestItems = [...items]
    .filter((i) => i.scarcityScore != null)
    .sort((a, b) => (b.scarcityScore ?? 0) - (a.scarcityScore ?? 0))
    .slice(0, 5);

  const title = `S&box Market Report — Week ${week}, ${year}`;
  const excerpt = capChange != null
    ? `Listings value moved ${capChange >= 0 ? "+" : ""}${capChange.toFixed(1)}% this week across ${totalItems} tracked S&box skins.`
    : `Weekly snapshot of the S&box skin market across ${totalItems} tracked items.`;

  const md = buildMarkdown({
    week,
    year,
    totalItems,
    currentListings,
    capChange,
    gainers,
    losers,
    rarestItems,
  });

  const post = await prisma.blogPost.create({
    data: {
      slug,
      title,
      excerpt,
      content: md,
      kind: "weekly-report",
    },
  });

  return { created: true, slug: post.slug, title: post.title };
}

interface WeeklyMover {
  name: string;
  slug: string;
  currentPrice: number | null;
  weeklyChangePct: number;
  weekAgoPrice: number;
}

function buildMarkdown(data: {
  week: number;
  year: number;
  totalItems: number;
  currentListings: number;
  capChange: number | null;
  gainers: WeeklyMover[];
  losers: WeeklyMover[];
  rarestItems: Array<{ name: string; slug: string; currentPrice: number | null; scarcityScore: number | null }>;
}): string {
  const capLine = data.capChange != null
    ? `The total listings value of the S&box skin market is **${formatPrice(data.currentListings)}**, a ${data.capChange >= 0 ? "gain" : "drop"} of **${data.capChange.toFixed(1)}%** week-over-week.`
    : `The total listings value of the S&box skin market is **${formatPrice(data.currentListings)}**.`;

  const moverLine = (m: WeeklyMover, i: number): string => {
    const sign = m.weeklyChangePct >= 0 ? "+" : "";
    return `${i + 1}. [${m.name}](/items/${m.slug}) — ${formatPrice(m.weekAgoPrice)} → ${formatPrice(m.currentPrice ?? 0)} (${sign}${m.weeklyChangePct.toFixed(1)}%)`;
  };

  const gainerLines = data.gainers.map(moverLine).join("\n");
  const loserLines = data.losers.map(moverLine).join("\n");
  const rarestLines = data.rarestItems
    .map((r, i) => `${i + 1}. [${r.name}](/items/${r.slug}) — scarcity ${r.scarcityScore?.toFixed(0)}/100 · ${formatPrice(r.currentPrice ?? 0)}`)
    .join("\n");

  const emptyNote = "_Not enough 7-day price history yet — we'll fill this section once more data accumulates._";

  return `## Market Overview

${capLine}

We're tracking **${data.totalItems}** unique S&box skins this week across the Steam Community Market.

## Top Gainers This Week

${gainerLines || emptyNote}

## Top Losers This Week

${loserLines || emptyNote}

## Rarest Skins by Scarcity Score

These are the skins with the tightest distribution and lowest liquidity right now — whales holding, market thin, high momentum.

${rarestLines || "_Scarcity data still populating._"}

## What This Means

Week ${data.week} of ${data.year} ${data.capChange != null && data.capChange > 0 ? "was a net-positive week for holders" : data.capChange != null && data.capChange < 0 ? "was a correction week for the market" : "kept the S&box economy humming"}. Keep an eye on the top gainers — rapid moves often signal accumulation or sudden demand shifts. The losers list is where bargain hunters should be looking.

For live data, check the [Trends page](/trends) and set [price alerts](/items) on items you're watching.

---

_This report is auto-generated from our market data every Friday. Data pulled from the Steam Community Market and sbox.dev._`;
}

function getIsoWeek(date: Date): { year: number; week: number } {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { year: d.getUTCFullYear(), week };
}
