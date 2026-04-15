import { prisma } from "@/lib/db";
import { formatPrice } from "@/lib/utils";
import type { TweetWithAuthor } from "./client";

const SITE = "https://sboxskins.gg";

export interface ReplyDraft {
  tweet: TweetWithAuthor;
  replies: string[];
  matchedItemSlug?: string;
  matchedItemName?: string;
  reason: string;
}

/**
 * Normalize text for fuzzy item-name matching.
 */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Try to match an item name in the tweet text. Returns the best match by
 * longest matched name (so "Easter Bunny Hat 2026" beats "Hat").
 */
async function findMatchedItem(tweetText: string) {
  const items = await prisma.item.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      currentPrice: true,
      totalSupply: true,
      priceChange24h: true,
      isLimited: true,
    },
  });

  const normText = normalize(tweetText);
  let best: (typeof items)[number] | null = null;
  let bestLen = 0;

  for (const item of items) {
    const normName = normalize(item.name);
    if (normName.length < 4) continue; // too short, would false-positive
    // Require the name to appear as a phrase — with word boundaries
    const re = new RegExp(`\\b${normName.replace(/\s+/g, "\\s+")}\\b`);
    if (re.test(normText) && normName.length > bestLen) {
      best = item;
      bestLen = normName.length;
    }
  }

  return best;
}

/**
 * Generate 3 reply variations for a given tweet. Returns the drafts + metadata
 * about what we matched on (item, price signal, etc).
 */
export async function draftReply(tweet: TweetWithAuthor): Promise<ReplyDraft> {
  const matched = await findMatchedItem(tweet.text);
  const text = tweet.text;
  const textLower = text.toLowerCase();

  // Priority 1: a specific item was named — reply with its data
  if (matched) {
    const url = `${SITE}/items/${matched.slug}`;
    const price = matched.currentPrice != null ? formatPrice(matched.currentPrice) : null;
    const supply = matched.totalSupply;
    const change = matched.priceChange24h;

    const lines: string[] = [];
    if (price && change !== null && change !== undefined && change !== 0) {
      const pct = change.toFixed(1);
      const direction = change > 0 ? "+" : "";
      lines.push(
        `fwiw ${matched.name} is sitting at ${price} right now, ${direction}${pct}% in 24h. live chart: ${url}`,
      );
    }
    if (price && supply) {
      lines.push(
        `${matched.name} watch: ${price} · ${supply.toLocaleString()} exist total. ${url}`,
      );
    }
    if (price) {
      lines.push(`${matched.name} is ${price} on the Steam Market rn. ${url}`);
    }
    if (matched.isLimited) {
      lines.push(
        `fun fact ${matched.name} is capped-supply — no new ones being minted. ${url}`,
      );
    }
    // Fallback
    if (lines.length === 0) {
      lines.push(`we track ${matched.name} here → ${url}`);
    }

    return {
      tweet,
      replies: lines.slice(0, 3),
      matchedItemSlug: matched.slug,
      matchedItemName: matched.name,
      reason: `Tweet mentions "${matched.name}"`,
    };
  }

  // Priority 2: tweet is about price/value/market → reply with market snapshot
  if (
    textLower.match(/\b(price|prices|market|value|worth|cheap|expensive|invest|flip)\b/)
  ) {
    const stats = await prisma.item.findMany({
      select: { currentPrice: true, volume: true },
    });
    const marketCap = stats.reduce(
      (sum, i) => sum + (i.currentPrice ?? 0) * (i.volume ?? 0),
      0,
    );
    const replies = [
      `if it helps, we track every S&box skin price in one place: ${SITE}`,
      `S&box market is doing ${formatPrice(marketCap)} right now. live data at ${SITE}`,
      `we pull live prices from Steam every 15 min. charts, order books, the whole thing: ${SITE}`,
    ];
    return {
      tweet,
      replies,
      reason: "Tweet mentions prices/market — market snapshot reply",
    };
  }

  // Priority 3: tweet mentions "rare" / "limited" / "supply"
  if (textLower.match(/\b(rare|limited|scarce|supply|mint|exist)\b/)) {
    const rarest = await prisma.item.findFirst({
      where: { totalSupply: { not: null, gt: 0 } },
      orderBy: { totalSupply: "asc" },
    });
    const replies = rarest
      ? [
          `btw rarest S&box skin we track is ${rarest.name} — ${rarest.totalSupply?.toLocaleString()} exist. ${SITE}/items/${rarest.slug}`,
          `supply data for every S&box skin: ${SITE}`,
          `we track total supply counts on sbox.game metrics. rarest is ${rarest.name} at ${rarest.totalSupply?.toLocaleString()}. ${SITE}`,
        ]
      : [
          `we track supply counts for every S&box skin → ${SITE}`,
          `supply, prices, everything in one place: ${SITE}`,
        ];
    return {
      tweet,
      replies: replies.slice(0, 3),
      reason: "Tweet mentions rarity/supply",
    };
  }

  // Priority 4: generic S&box/sbox mention — soft, friendly reply
  const replies = [
    `S&box skin prices? we got you → ${SITE}`,
    `btw if you're into S&box cosmetics we track the whole market: ${SITE}`,
    `whenever you want to check prices on S&box skins: ${SITE}`,
  ];
  return {
    tweet,
    replies,
    reason: "Generic S&box mention",
  };
}
