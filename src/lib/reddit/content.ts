import { prisma } from "@/lib/db";
import { formatPrice } from "@/lib/utils";

/**
 * Reddit post generator. Totally different shape from tweet generators:
 * each draft has a TITLE, a long-form BODY (markdown), and SUBREDDIT
 * recommendations with per-sub rationale.
 *
 * Self-promotion rules are strict on Reddit — most subs will ban a post
 * that just drops a sboxskins.gg link. These templates lead with value
 * (actual market analysis, data tables, charts you can screenshot) and
 * mention the site once, in context, where a reader would reasonably
 * want more detail. That's what makes the difference between a post
 * that stays up and one that gets removed.
 */

export type RedditKind =
  | "weekly-analysis"
  | "item-spotlight"
  | "scarcity-guide"
  | "whale-watch"
  | "store-rotation";

export interface SubredditPick {
  name: string; // "r/sbox"
  reason: string; // why this sub is a fit
  /** Self-promo risk: "low" = native to the sub's content; "medium" =
   *  fits but moderators may push back; "high" = post only if it's
   *  exceptionally valuable and follow the sub's self-promo rule (e.g.
   *  9:1 contribution ratio). */
  risk: "low" | "medium" | "high";
}

export interface RedditDraft {
  kind: RedditKind;
  title: string;
  body: string; // markdown
  subreddits: SubredditPick[];
  /** URL to a shareable card / OG image we'd attach. Reddit allows one
   *  image + a body, which is the ideal engagement pattern. */
  imageUrl?: string;
  /** Permalink back to our site referenced in the body. */
  link?: string;
}

const SITE = "https://sboxskins.gg";

// ---------- helpers ----------

async function getMostMoved7d(): Promise<
  | {
      item: {
        name: string;
        slug: string;
        currentPrice: number | null;
        totalSupply: number | null;
        uniqueOwners: number | null;
        scarcityScore: number | null;
      };
      changePct: number;
      baseline: number;
    }
  | null
> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const baselineStart = new Date(weekAgo.getTime() - 12 * 60 * 60 * 1000);
  const baselineEnd = new Date(weekAgo.getTime() + 12 * 60 * 60 * 1000);

  const [items, points] = await Promise.all([
    prisma.item.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        currentPrice: true,
        totalSupply: true,
        uniqueOwners: true,
        scarcityScore: true,
      },
    }),
    prisma.pricePoint.findMany({
      where: { timestamp: { gte: baselineStart, lte: baselineEnd } },
      select: { itemId: true, price: true },
    }),
  ]);

  const byItem = new Map<string, number[]>();
  for (const p of points) {
    const arr = byItem.get(p.itemId) ?? [];
    arr.push(p.price);
    byItem.set(p.itemId, arr);
  }

  let best: {
    item: (typeof items)[number];
    changePct: number;
    baseline: number;
  } | null = null;
  let bestAbs = 0;
  for (const item of items) {
    const prices = byItem.get(item.id);
    if (!prices || prices.length === 0) continue;
    const sorted = [...prices].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const baseline =
      sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];
    if (baseline <= 0 || (item.currentPrice ?? 0) <= 0) continue;
    const change = ((item.currentPrice! - baseline) / baseline) * 100;
    if (Math.abs(change) > bestAbs) {
      bestAbs = Math.abs(change);
      best = { item, changePct: change, baseline };
    }
  }
  return best;
}

// ---------- subreddit recommendation sets ----------

const SUBS = {
  sbox: {
    name: "r/sbox",
    reason: "Native S&box community — most engaged audience for skin + market content.",
    risk: "low" as const,
  },
  rust: {
    name: "r/rust",
    reason:
      "Shared Facepunch audience. Accepts S&box content when framed as 'same studio, new thing'. Read Rule 7 before posting.",
    risk: "medium" as const,
  },
  gmod: {
    name: "r/GarrysMod",
    reason:
      "Older Facepunch audience, overlap with S&box early adopters. Post as 'if you liked GMod, here's what the cosmetics economy looks like in sbox'.",
    risk: "medium" as const,
  },
  steamMarket: {
    name: "r/SteamMarket",
    reason:
      "Market-data nerds. Data-dense analysis performs well. Skip if the post is promotional.",
    risk: "low" as const,
  },
  cstrade: {
    name: "r/GlobalOffensiveTrade",
    reason:
      "CS skin traders — exactly the audience we want. Only post if the content genuinely teaches them something new (e.g. how sbox scarcity math differs from CS).",
    risk: "high" as const,
  },
  wowEconomy: {
    name: "r/woweconomy",
    reason:
      "Virtual-economy enthusiasts who aren't CS or S&box-native but like the math. Comparative analysis posts do well here.",
    risk: "medium" as const,
  },
  gameTrade: {
    name: "r/GameTrade",
    reason:
      "General in-game-item trading. Skin spotlights with prices land okay if there's an angle beyond 'check out this price'.",
    risk: "medium" as const,
  },
};

// ---------- individual generators ----------

export async function genWeeklyAnalysis(): Promise<RedditDraft | null> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [items, oldSnap] = await Promise.all([
    prisma.item.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        currentPrice: true,
        volume: true,
        totalSupply: true,
      },
    }),
    prisma.marketSnapshot.findFirst({
      where: { timestamp: { lte: new Date(weekAgo.getTime() + 12 * 3600 * 1000) } },
      orderBy: { timestamp: "desc" },
    }),
  ]);
  if (items.length === 0) return null;

  const currentListings = items.reduce(
    (s, i) => s + (i.currentPrice ?? 0) * (i.volume ?? 0),
    0,
  );
  const capChange =
    oldSnap && oldSnap.listingsValue > 0
      ? ((currentListings - oldSnap.listingsValue) / oldSnap.listingsValue) * 100
      : null;

  const priced = items.filter((i) => (i.currentPrice ?? 0) > 0);
  const totalListings = items.reduce((s, i) => s + (i.volume ?? 0), 0);

  const biggest = await getMostMoved7d();

  const title = biggest
    ? `S&box skin market — week in review. ${biggest.item.name} ${biggest.changePct >= 0 ? "up" : "down"} ${Math.abs(biggest.changePct).toFixed(0)}%, full breakdown inside`
    : `S&box skin market — week in review (${items.length} tracked skins)`;

  const body = `The S&box cosmetics market is still young enough that one week actually moves the needle. Here's what happened.

**Market size**
- Total listings value: **${formatPrice(currentListings)}**${
    capChange != null
      ? ` (${capChange >= 0 ? "+" : ""}${capChange.toFixed(1)}% WoW)`
      : ""
  }
- Active listings: **${totalListings.toLocaleString()}**
- Tracked skins: **${items.length}** (${priced.length} with a current market price)
${biggest ? `\n**Biggest mover**\n\n[${biggest.item.name}](${SITE}/items/${biggest.item.slug}) went from ${formatPrice(biggest.baseline)} to ${formatPrice(biggest.item.currentPrice ?? 0)} — ${biggest.changePct >= 0 ? "+" : ""}${biggest.changePct.toFixed(1)}% on the week.\n\n- Total supply: ${biggest.item.totalSupply?.toLocaleString() ?? "unknown"}\n- Unique owners: ${biggest.item.uniqueOwners?.toLocaleString() ?? "unknown"}\n- Scarcity score: ${biggest.item.scarcityScore?.toFixed(0) ?? "—"}/100\n` : ""}

**Context for CS/Rust traders**

The S&box market is roughly where CS:GO was in 2014 — thin order books, fast moves on individual skins, store rotation creating sharp scarcity spikes when items delist. Float concentration matters more than in CS (some items have <200 units total).

**Why this post exists**

I've been tracking every S&box skin on the Steam Community Market for a while now and figured the weekly view is worth posting. Full data including order-book depth, supply history, and per-item scarcity is at [sboxskins.gg](${SITE}) if anyone wants the raw numbers.

No trade advice — just the math. Happy to answer questions.`;

  return {
    kind: "weekly-analysis",
    title,
    body,
    subreddits: [
      SUBS.sbox,
      SUBS.steamMarket,
      SUBS.rust,
      SUBS.wowEconomy,
    ],
    link: `${SITE}/trends`,
    imageUrl: biggest
      ? `${SITE}/s/${biggest.item.slug}/opengraph-image`
      : `${SITE}/opengraph-image`,
  };
}

export async function genItemSpotlight(): Promise<RedditDraft | null> {
  const biggest = await getMostMoved7d();
  if (!biggest) return null;

  const { item, changePct, baseline } = biggest;
  const direction = changePct >= 0 ? "up" : "down";
  const absChange = Math.abs(changePct).toFixed(1);

  const title = `S&box spotlight — ${item.name} ${direction} ${absChange}% this week (${formatPrice(item.currentPrice ?? 0)})`;

  const body = `**${item.name}**

- Price 7 days ago: ${formatPrice(baseline)}
- Price now: **${formatPrice(item.currentPrice ?? 0)}**
- 7d change: **${changePct >= 0 ? "+" : ""}${changePct.toFixed(1)}%**
- Total supply: ${item.totalSupply?.toLocaleString() ?? "unknown"}
- Unique owners: ${item.uniqueOwners?.toLocaleString() ?? "unknown"}
- Scarcity score: ${item.scarcityScore?.toFixed(0) ?? "—"}/100

**What's notable**

${
  item.totalSupply && item.uniqueOwners
    ? `Supply is ${item.totalSupply.toLocaleString()} with ${item.uniqueOwners.toLocaleString()} distinct owners — that's ${(item.totalSupply / item.uniqueOwners).toFixed(2)} units per holder on average. Distribution this concentrated means price moves on small accumulation.\n`
    : ""
}
${
  item.scarcityScore != null && item.scarcityScore >= 70
    ? `Scarcity score of ${item.scarcityScore.toFixed(0)} puts it in the top tier across the catalog — low float, thin listings, momentum building.\n`
    : ""
}

Full order book + 30-day history: [sboxskins.gg](${SITE}/items/${item.slug})

No position here, just flagging the move. Not trade advice.`;

  return {
    kind: "item-spotlight",
    title,
    body,
    subreddits: [SUBS.sbox, SUBS.steamMarket, SUBS.gameTrade, SUBS.cstrade],
    link: `${SITE}/items/${item.slug}`,
    imageUrl: `${SITE}/s/${item.slug}/opengraph-image`,
  };
}

export async function genScarcityGuide(): Promise<RedditDraft | null> {
  const rarest = await prisma.item.findMany({
    where: { scarcityScore: { not: null, gt: 0 } },
    orderBy: { scarcityScore: "desc" },
    take: 5,
    select: {
      name: true,
      slug: true,
      currentPrice: true,
      totalSupply: true,
      uniqueOwners: true,
      scarcityScore: true,
    },
  });
  if (rarest.length === 0) return null;

  const rows = rarest
    .map(
      (r, i) =>
        `| ${i + 1} | [${r.name}](${SITE}/items/${r.slug}) | ${r.scarcityScore?.toFixed(0) ?? "—"}/100 | ${r.totalSupply?.toLocaleString() ?? "—"} | ${r.uniqueOwners?.toLocaleString() ?? "—"} | ${formatPrice(r.currentPrice ?? 0)} |`,
    )
    .join("\n");

  const title = `How S&box skin scarcity math actually works (with the 5 rarest items right now)`;
  const body = `If you've traded CS skins, you know float + rarity tier drive price. S&box scarcity works differently — there's no wear system and no case-vs-drop divide. What matters:

1. **Total supply** — every copy that exists. Some items have <200 units total (CS Dragon Lore-tier levels of rare).
2. **Unique owners** — how spread out the supply is. Low unique-owner counts = thin float, whales control price.
3. **Supply on market** — active listings. Hoarding happens.
4. **Store status** — items that rotate out of the store create secondary-market pressure.

I've been blending these into a single **scarcity score** (0–100). Top 5 right now:

| Rank | Item | Scarcity | Supply | Owners | Price |
|---|---|---|---|---|---|
${rows}

**How to read the table**

High scarcity + low supply + low owners = classic grail setup. Price may be low now if the item is obscure, but float is tight enough that any demand bump moves the market.

Full methodology and live rankings: [sboxskins.gg/trends](${SITE}/trends)

Note this is market observation, not trade advice. S&box cosmetics are a small market and illiquid — know what that means before you act on any of this.`;

  return {
    kind: "scarcity-guide",
    title,
    body,
    subreddits: [
      SUBS.sbox,
      SUBS.steamMarket,
      SUBS.cstrade,
      SUBS.wowEconomy,
      SUBS.gameTrade,
    ],
    link: `${SITE}/trends`,
    imageUrl: `${SITE}/trends/opengraph-image`,
  };
}

export async function genWhaleWatch(): Promise<RedditDraft | null> {
  // Find an item where topHolders JSON is populated and one holder has
  // notable concentration. Mirrors the whale-spotlight helper logic but
  // simpler — we aren't tracking "previously spotlighted" for reddit since
  // it's less repeat-heavy than the newsletter.
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

  let best: {
    name: string;
    slug: string;
    currentPrice: number | null;
    totalSupply: number;
    uniqueOwners: number | null;
    topCount: number;
    share: number;
    topCounts: number[];
  } | null = null;
  for (const item of items) {
    if (!item.topHolders || !item.totalSupply) continue;
    try {
      const holders = item.topHolders as unknown as Array<{
        count?: number;
        amount?: number;
      }>;
      if (!Array.isArray(holders) || holders.length === 0) continue;
      const counts = holders
        .map((h) => h.count ?? h.amount ?? 0)
        .filter((n) => n > 0);
      if (counts.length < 2) continue;
      const share = counts[0] / item.totalSupply;
      if (share < 0.1) continue;
      if (!best || share > best.share) {
        best = {
          name: item.name,
          slug: item.slug,
          currentPrice: item.currentPrice,
          totalSupply: item.totalSupply,
          uniqueOwners: item.uniqueOwners,
          topCount: counts[0],
          share,
          topCounts: counts.slice(0, 10),
        };
      }
    } catch {
      continue;
    }
  }
  if (!best) return null;

  const title = `Whale watch — one account owns ${(best.share * 100).toFixed(0)}% of ${best.name}'s total supply`;
  const distribution = best.topCounts
    .map((n, i) => `- #${i + 1}: ${n} unit${n === 1 ? "" : "s"}`)
    .join("\n");

  const body = `${best.name} has a **${best.totalSupply.toLocaleString()}** total supply. The top holder has **${best.topCount}** of them — **${(best.share * 100).toFixed(1)}% of the entire float**.

**Top 10 holdings**

${distribution}

**Why this matters**

When float is this concentrated, small accumulation or listing decisions by one account move the entire market for the skin. CS collectors know this pattern from early StatTrak rarities — a handful of people control enough units that the order book reflects their decisions more than organic demand.

- Current price: ${formatPrice(best.currentPrice ?? 0)}
- Unique owners total: ${best.uniqueOwners?.toLocaleString() ?? "unknown"}

Live data + other concentrated items: [sboxskins.gg/items/${best.slug}](${SITE}/items/${best.slug})

Not trade advice. Just pointing out the math.`;

  return {
    kind: "whale-watch",
    title,
    body,
    subreddits: [SUBS.sbox, SUBS.steamMarket, SUBS.cstrade],
    link: `${SITE}/items/${best.slug}`,
    imageUrl: `${SITE}/s/${best.slug}/opengraph-image`,
  };
}

export async function genStoreRotation(): Promise<RedditDraft | null> {
  const now = new Date();
  const cutoff = new Date(now.getTime() + 21 * 24 * 60 * 60 * 1000);
  const leaving = await prisma.item.findMany({
    where: {
      isActiveStoreItem: true,
      leavingStoreAt: { gte: now, lte: cutoff },
    },
    orderBy: { leavingStoreAt: "asc" },
    take: 8,
    select: {
      name: true,
      slug: true,
      currentPrice: true,
      storePrice: true,
      leavingStoreAt: true,
      totalSupply: true,
    },
  });
  if (leaving.length === 0) return null;

  const rows = leaving
    .map((l) => {
      const days = l.leavingStoreAt
        ? Math.ceil(
            (l.leavingStoreAt.getTime() - now.getTime()) /
              (24 * 60 * 60 * 1000),
          )
        : null;
      return `| [${l.name}](${SITE}/items/${l.slug}) | ${days ?? "—"}d | ${formatPrice(l.currentPrice ?? 0)} | ${l.storePrice != null ? formatPrice(l.storePrice) : "—"} | ${l.totalSupply?.toLocaleString() ?? "—"} |`;
    })
    .join("\n");

  const title = `S&box items rotating out of the store in the next 3 weeks (${leaving.length} items)`;
  const body = `Store rotations historically spike secondary-market prices for the rotating items — once an item is off sale, the only way to get it is the Community Market, and supply stops growing.

| Item | Leaves in | Market price | Original | Total supply |
|---|---|---|---|---|
${rows}

**How this usually plays out**

In the weeks before a rotation, speculators start accumulating. The day of rotation often sees a sharp spike (often 20-60%), then settles 10-20% above the pre-rotation baseline depending on how well the item ages.

Not every item moves — items that are unpopular while in the store often stay unpopular after. The ones that tend to spike are items with decent in-store demand that will be genuinely unreplaceable once gone.

Live countdown timers + order books: [sboxskins.gg](${SITE})

Not trade advice — rotations can also just not move the market. Always check actual listing depth before assuming.`;

  return {
    kind: "store-rotation",
    title,
    body,
    subreddits: [SUBS.sbox, SUBS.steamMarket, SUBS.cstrade, SUBS.gameTrade],
    link: SITE,
    imageUrl: `${SITE}/opengraph-image`,
  };
}

export async function generateRedditDrafts(): Promise<RedditDraft[]> {
  const results = await Promise.all([
    genWeeklyAnalysis(),
    genItemSpotlight(),
    genScarcityGuide(),
    genWhaleWatch(),
    genStoreRotation(),
  ]);
  return results.filter((d): d is RedditDraft => d !== null);
}
