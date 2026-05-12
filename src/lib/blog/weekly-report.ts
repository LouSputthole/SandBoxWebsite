import { prisma } from "@/lib/db";
import { formatPrice } from "@/lib/utils";
import { scoreAllItems, type ScoredItem } from "@/lib/market/momentum";
import { pickWhaleSpotlight, type WhaleSpotlight } from "./whales-spotlight";
import { writeFridayNarrative } from "./narrative";

/**
 * Friday weekly market report. Shipped as a blog post AND queued for
 * newsletter delivery. Stat sections are generator-produced (reliable
 * under flaky LLM outages); narrative sections are Claude-written with
 * anti-duplication context. Fully graceful fallback — if Anthropic is
 * unreachable, the whole report still ships with flat-template narrative.
 */
export async function generateAndSaveWeeklyReport(): Promise<{
  created: boolean;
  slug: string;
  title: string;
}> {
  const now = new Date();
  const { year, week } = getIsoWeek(now);
  const slug = `weekly-report-${year}-w${String(week).padStart(2, "0")}`;

  const existing = await prisma.blogPost.findUnique({ where: { slug } });
  if (existing) {
    return { created: false, slug, title: existing.title };
  }

  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const baselineStart = new Date(weekAgo.getTime() - 12 * 60 * 60 * 1000);
  const baselineEnd = new Date(weekAgo.getTime() + 12 * 60 * 60 * 1000);

  const [items, oldSnap, newestSnap, weekAgoPoints, scored, whale] =
    await Promise.all([
      prisma.item.findMany({
        select: {
          id: true, name: true, slug: true, type: true,
          currentPrice: true, priceChange24h: true,
          totalSupply: true, uniqueOwners: true, volume: true,
          scarcityScore: true, soldPast24h: true, isActiveStoreItem: true,
          leavingStoreAt: true, category: true,
        },
      }),
      prisma.marketSnapshot.findFirst({
        where: { timestamp: { lte: baselineEnd } },
        orderBy: { timestamp: "desc" },
      }),
      prisma.marketSnapshot.findFirst({ orderBy: { timestamp: "desc" } }),
      prisma.pricePoint.findMany({
        where: { timestamp: { gte: baselineStart, lte: baselineEnd } },
        select: { itemId: true, price: true },
      }),
      scoreAllItems(),
      pickWhaleSpotlight(),
    ]);

  // Median baseline per item — robust to single-point outlier spikes.
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
    const m =
      sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];
    if (m > 0) priceWeekAgo.set(itemId, m);
  }

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

  // --- New analysis sections ---
  const categoryBreakdown = buildCategoryBreakdown(items);
  const volumeLeaders = [...items]
    .filter((i) => i.volume != null && i.volume > 0)
    .sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0))
    .slice(0, 5);
  const soldLeaders = [...items]
    .filter((i) => i.soldPast24h != null && i.soldPast24h > 0)
    .sort((a, b) => (b.soldPast24h ?? 0) - (a.soldPast24h ?? 0))
    .slice(0, 5);
  const leavingStore = items
    .filter(
      (i) =>
        i.isActiveStoreItem &&
        i.leavingStoreAt &&
        i.leavingStoreAt.getTime() - now.getTime() <
          21 * 24 * 60 * 60 * 1000,
    )
    .sort(
      (a, b) =>
        (a.leavingStoreAt?.getTime() ?? Infinity) -
        (b.leavingStoreAt?.getTime() ?? Infinity),
    )
    .slice(0, 5);
  const topMomentum = scored.filter((s) => s.momentumScore > 0).slice(0, 6);

  // Claude-generated narrative (falls back to template strings if null).
  const narrative = await writeFridayNarrative({
    week,
    year,
    totalItems,
    currentListings,
    capChange,
    gainers: gainers.map((g) => ({
      name: g.name,
      slug: g.slug,
      weeklyChangePct: g.weeklyChangePct,
    })),
    losers: losers.map((l) => ({
      name: l.name,
      slug: l.slug,
      weeklyChangePct: l.weeklyChangePct,
    })),
    topMomentum: topMomentum.map((m) => ({
      name: m.name,
      slug: m.slug,
      momentumScore: m.momentumScore,
      rationale: m.rationale,
    })),
    whaleSpotlight: whale
      ? {
          name: whale.item.name,
          slug: whale.item.slug,
          topHolderShare: whale.topHolderShare,
        }
      : null,
  });

  const title = `S&box Market Report — Week ${week}, ${year}`;
  const excerpt =
    capChange != null
      ? `Listings value moved ${capChange >= 0 ? "+" : ""}${capChange.toFixed(1)}% this week across ${totalItems} tracked S&box skins.`
      : `Weekly snapshot of the S&box skin market across ${totalItems} tracked items.`;

  const md = buildMarkdown({
    week, year, totalItems, currentListings, capChange,
    gainers, losers, rarestItems, topMomentum, categoryBreakdown,
    volumeLeaders, soldLeaders, leavingStore, whale, narrative,
  });

  const post = await prisma.blogPost.create({
    data: { slug, title, excerpt, content: md, kind: "weekly-report" },
  });

  return { created: true, slug: post.slug, title: post.title };
}

// ---------- helpers ----------

interface WeeklyItem {
  name: string; slug: string; type: string;
  currentPrice: number | null; volume: number | null;
  soldPast24h: number | null; category: string | null;
  leavingStoreAt: Date | null; isActiveStoreItem: boolean;
}

interface CategoryRow {
  label: string;
  itemCount: number;
  totalListingsValue: number;
  avgPrice: number;
}

function buildCategoryBreakdown(items: WeeklyItem[]): CategoryRow[] {
  const byCat = new Map<string, WeeklyItem[]>();
  for (const i of items) {
    const label = i.category ?? i.type ?? "other";
    const arr = byCat.get(label) ?? [];
    arr.push(i);
    byCat.set(label, arr);
  }
  const rows: CategoryRow[] = [];
  for (const [label, group] of byCat) {
    const priced = group.filter((i) => i.currentPrice != null && i.currentPrice > 0);
    if (priced.length === 0) continue;
    const totalValue = priced.reduce(
      (s, i) => s + (i.currentPrice ?? 0) * (i.volume ?? 0),
      0,
    );
    const avg =
      priced.reduce((s, i) => s + (i.currentPrice ?? 0), 0) / priced.length;
    rows.push({
      label,
      itemCount: group.length,
      totalListingsValue: totalValue,
      avgPrice: avg,
    });
  }
  return rows.sort((a, b) => b.totalListingsValue - a.totalListingsValue);
}

interface WeeklyMover {
  name: string; slug: string;
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
  rarestItems: Array<{
    name: string; slug: string;
    currentPrice: number | null;
    scarcityScore: number | null;
  }>;
  topMomentum: ScoredItem[];
  categoryBreakdown: CategoryRow[];
  volumeLeaders: WeeklyItem[];
  soldLeaders: WeeklyItem[];
  leavingStore: WeeklyItem[];
  whale: WhaleSpotlight | null;
  narrative: { overview: string | null; closing: string | null };
}): string {
  const { narrative } = data;

  const fallbackOverview =
    data.capChange != null
      ? `Total listings value sits at **${formatPrice(data.currentListings)}**, a ${data.capChange >= 0 ? "gain" : "drop"} of **${data.capChange.toFixed(1)}%** week-over-week across ${data.totalItems} tracked S&box skins.`
      : `Total listings value sits at **${formatPrice(data.currentListings)}** across ${data.totalItems} tracked S&box skins.`;

  const fallbackClosing = `Week ${data.week} of ${data.year} ${
    data.capChange != null && data.capChange > 0
      ? "was net-positive for holders"
      : data.capChange != null && data.capChange < 0
        ? "brought a correction"
        : "kept the economy humming"
  }. Watch the top momentum list below — those are the items with multiple signals lining up, not just a single spiky print.`;

  const moverLine = (m: WeeklyMover, i: number): string => {
    const sign = m.weeklyChangePct >= 0 ? "+" : "";
    return `${i + 1}. [${m.name}](/items/${m.slug}) — ${formatPrice(m.weekAgoPrice)} → ${formatPrice(m.currentPrice ?? 0)} (${sign}${m.weeklyChangePct.toFixed(1)}%)`;
  };

  const gainerLines = data.gainers.map(moverLine).join("\n");
  const loserLines = data.losers.map(moverLine).join("\n");

  const rarestLines = data.rarestItems
    .map(
      (r, i) =>
        `${i + 1}. [${r.name}](/items/${r.slug}) — scarcity ${r.scarcityScore?.toFixed(0)}/100 · ${formatPrice(r.currentPrice ?? 0)}`,
    )
    .join("\n");

  const momentumLines = data.topMomentum
    .map((m, i) => {
      const why =
        m.rationale.length > 0 ? ` — ${m.rationale.join("; ")}` : "";
      return `${i + 1}. [${m.name}](/items/${m.slug}) — momentum **${m.momentumScore.toFixed(1)}**${why}`;
    })
    .join("\n");

  const categoryLines = data.categoryBreakdown
    .slice(0, 8)
    .map(
      (c) =>
        `- **${c.label}** — ${c.itemCount} items · avg ${formatPrice(c.avgPrice)} · listings value ${formatPrice(c.totalListingsValue)}`,
    )
    .join("\n");

  const volumeLines = data.volumeLeaders
    .map(
      (v, i) =>
        `${i + 1}. [${v.name}](/items/${v.slug}) — ${v.volume?.toLocaleString() ?? 0} listings · ${formatPrice(v.currentPrice ?? 0)}`,
    )
    .join("\n");

  const soldLines = data.soldLeaders
    .map(
      (s, i) =>
        `${i + 1}. [${s.name}](/items/${s.slug}) — ${s.soldPast24h?.toLocaleString() ?? 0} sold past 24h`,
    )
    .join("\n");

  const leavingLines = data.leavingStore
    .map((l) => {
      const days = l.leavingStoreAt
        ? Math.ceil(
            (l.leavingStoreAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000),
          )
        : null;
      return `- [${l.name}](/items/${l.slug})${days != null ? ` — leaves in ${days}d` : ""}`;
    })
    .join("\n");

  const whaleSection = data.whale
    ? `## Whale Spotlight

**Whale spotlight: [${data.whale.item.name}](/items/${data.whale.item.slug})** — one holder controls **${data.whale.topHolderCount}** units, or **${(data.whale.topHolderShare * 100).toFixed(1)}%** of the total ${data.whale.item.totalSupply?.toLocaleString() ?? "?"} supply. Across the top 10 holders we count **${data.whale.whaleCount}** whales (5+ units each). When distribution is this tight, small accumulation moves the whole market for this skin.

Top-10 holdings (counts only — we don't dox Steam IDs): ${data.whale.topHoldings.join(", ")}.`
    : "";

  return `## Market Overview

${narrative.overview ?? fallbackOverview}

We're tracking **${data.totalItems}** unique S&box skins across the Steam Community Market.

## Top Momentum This Week

Our composite momentum score blends 7-day and 30-day price trends, volume surges, supply contraction, holder concentration, and store-rotation signals. Items ranking high have multiple indicators pointing the same way — not just a one-off spike.

${momentumLines || "_Momentum data populating — need more price history for full coverage._"}

## Top Gainers

${gainerLines || "_Not enough 7-day price history yet._"}

## Top Losers

${loserLines || "_Not enough 7-day price history yet._"}

## Category Breakdown

${categoryLines || "_Category data still populating._"}

## Volume Leaders

Most listed on the Steam Community Market right now. Deep order books → easier to buy/sell at market.

${volumeLines || "_Volume data still populating._"}

## Busiest Past 24h

Actual sales — not listings. The skins people are actively trading.

${soldLines || "_Sales-velocity data still populating._"}

${data.leavingStore.length > 0 ? `## Leaving the Store Soon

Items in the S&box store that rotate out within 3 weeks. Historically, store rotations drive a spike in secondary-market price — worth watching these.

${leavingLines}` : ""}

## Rarest Skins by Scarcity Score

Tightest distribution and thinnest liquidity right now.

${rarestLines || "_Scarcity data still populating._"}

${whaleSection}

${partnerSpotlightSection()}

## What This Means

${narrative.closing ?? fallbackClosing}

For live data, check [Trends](/trends) and set [price alerts](/items) on items you're watching. Get this report in your inbox every Friday — [subscribe to the newsletter](/#newsletter) (we also do a Monday forward-looking outlook).

---

_Auto-generated from our market data every Friday. Signals pulled from the Steam Community Market, sbox.dev, and our own daily supply snapshots._`;
}

/**
 * Optional Partner Spotlight section in the Friday wrap. Renders a
 * one-paragraph callout pointing readers at the Trading Hub for
 * face-to-face trading. Gated on PARTNER_HUB_ENABLED env var so dev
 * + test report runs don't accidentally advertise the partnership
 * before launch. Once we go live, set PARTNER_HUB_ENABLED=1 in
 * production env and every Friday's report includes the section.
 */
function partnerSpotlightSection(): string {
  if (process.env.PARTNER_HUB_ENABLED !== "1") return "";
  return `## Partner Spotlight: S&box Trading Hub

Need to coordinate a trade in person? Our partner the [S&box Trading Hub](/go/hub?from=newsletter) is where the community meets up — in-game lounge + Discord, no fees, no escrow, just traders showing up to deal directly. Worth bookmarking if you're posting on our [trading board](/trade).
`;
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
