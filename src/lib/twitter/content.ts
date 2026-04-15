import { prisma } from "@/lib/db";
import { formatPrice } from "@/lib/utils";

export type TweetKind =
  | "top-gainer"
  | "top-loser"
  | "rarest"
  | "market-cap"
  | "item-spotlight"
  | "new-high"
  | "limited-edition";

export interface GeneratedTweet {
  kind: TweetKind;
  text: string;
  itemSlug?: string;
  /** Approximate character count after X shortens URLs (URLs = 23 chars each) */
  approxLength: number;
}

const SITE = "https://sboxskins.gg";

/** X counts every URL as 23 characters regardless of actual length. */
function approximateLength(text: string): number {
  let result = text;
  result = result.replace(/https?:\/\/\S+/g, "x".repeat(23));
  return result.length;
}

function itemUrl(slug: string): string {
  return `${SITE}/items/${slug}`;
}

/** Pick from an array using the same seed twice within a minute to avoid dupes on retries */
function seedPick<T>(arr: T[], seed = Math.floor(Date.now() / 60_000)): T {
  return arr[seed % arr.length];
}

// ----- Individual tweet generators (each returns null if no data fits) -----

export async function genTopGainer(): Promise<GeneratedTweet | null> {
  const item = await prisma.item.findFirst({
    where: { priceChange24h: { gt: 0 }, currentPrice: { not: null } },
    orderBy: { priceChange24h: "desc" },
  });
  if (!item || !item.priceChange24h || !item.currentPrice) return null;

  const pct = item.priceChange24h.toFixed(1);
  const price = formatPrice(item.currentPrice);

  const templates = [
    `${item.name} up ${pct}% today. somebody really wants this.\n\n${price} · ${itemUrl(item.slug)}`,
    `today's winner: ${item.name} (+${pct}%). line go up ${price}.\n\n${itemUrl(item.slug)}`,
    `${item.name} popped ${pct}% in 24h. ${price}. don't ask us, ask the buyers.\n\n${itemUrl(item.slug)}`,
    `biggest S&box mover of the day → ${item.name} +${pct}%.\n\n${price} and climbing. ${itemUrl(item.slug)}`,
  ];
  const text = seedPick(templates);
  return { kind: "top-gainer", text, itemSlug: item.slug, approxLength: approximateLength(text) };
}

export async function genTopLoser(): Promise<GeneratedTweet | null> {
  const item = await prisma.item.findFirst({
    where: { priceChange24h: { lt: 0 }, currentPrice: { not: null } },
    orderBy: { priceChange24h: "asc" },
  });
  if (!item || !item.priceChange24h || !item.currentPrice) return null;

  const pct = Math.abs(item.priceChange24h).toFixed(1);
  const price = formatPrice(item.currentPrice);

  const templates = [
    `rough day for ${item.name}. down ${pct}% at ${price}. paper hands are real out here.\n\n${itemUrl(item.slug)}`,
    `${item.name} took an L today (-${pct}%). sitting at ${price} now. dip or death spiral? you decide.\n\n${itemUrl(item.slug)}`,
    `${item.name}: -${pct}%. ${price}. someone's writing a breakup text to their inventory rn.\n\n${itemUrl(item.slug)}`,
    `${item.name} down ${pct}%. just reporting the news, not writing it.\n\n${price} · ${itemUrl(item.slug)}`,
  ];
  const text = seedPick(templates);
  return { kind: "top-loser", text, itemSlug: item.slug, approxLength: approximateLength(text) };
}

export async function genRarest(): Promise<GeneratedTweet | null> {
  const item = await prisma.item.findFirst({
    where: { totalSupply: { not: null, gt: 0 } },
    orderBy: { totalSupply: "asc" },
  });
  if (!item || !item.totalSupply) return null;

  const supply = item.totalSupply.toLocaleString();
  const priceNote = item.currentPrice ? ` ${formatPrice(item.currentPrice)} btw.` : "";

  const templates = [
    `only ${supply} of ${item.name} exist. that's it. that's the tweet.${priceNote}\n\n${itemUrl(item.slug)}`,
    `${item.name}: ${supply} in circulation. rarer than a quiet S&box Discord.${priceNote}\n\n${itemUrl(item.slug)}`,
    `rarest S&box skin on record: ${item.name} at ${supply} total.${priceNote} own it or envy it.\n\n${itemUrl(item.slug)}`,
    `${supply}. that's how many ${item.name}s will ever exist.${priceNote}\n\n${itemUrl(item.slug)}`,
  ];
  const text = seedPick(templates);
  return { kind: "rarest", text, itemSlug: item.slug, approxLength: approximateLength(text) };
}

export async function genMarketCap(): Promise<GeneratedTweet | null> {
  const items = await prisma.item.findMany({
    select: { currentPrice: true, volume: true, totalSupply: true },
  });
  if (items.length === 0) return null;

  const marketCap = items.reduce(
    (sum, i) => sum + (i.currentPrice ?? 0) * (i.volume ?? 0),
    0,
  );
  const totalListings = items.reduce((s, i) => s + (i.volume ?? 0), 0);
  const cap = formatPrice(marketCap);

  const templates = [
    `${cap} floating around in S&box skins right now. try explaining that at thanksgiving.\n\n${SITE}`,
    `state of the S&box economy:\n${cap} market cap, ${totalListings.toLocaleString()} listings, ${items.length} skins tracked. we just built the spreadsheet.\n\n${SITE}`,
    `daily PSA: S&box skins are a ${cap} market. your hat hobby is an asset class now.\n\n${SITE}`,
    `${cap} in hats, shoes, and face tattoos. the S&box economy is doing numbers.\n\n${SITE}`,
  ];
  const text = seedPick(templates);
  return { kind: "market-cap", text, approxLength: approximateLength(text) };
}

export async function genItemSpotlight(): Promise<GeneratedTweet | null> {
  // Random item from the top 20 by volume — ones people actually care about
  const candidates = await prisma.item.findMany({
    where: { currentPrice: { not: null, gt: 0 } },
    orderBy: { volume: "desc" },
    take: 20,
  });
  if (candidates.length === 0) return null;

  const item = candidates[Math.floor(Math.random() * candidates.length)];
  if (!item.currentPrice) return null;

  const price = formatPrice(item.currentPrice);
  const supplyPart = item.totalSupply ? ` · ${item.totalSupply.toLocaleString()} exist` : "";
  const listingsPart = item.volume ? ` · ${item.volume} listings` : "";

  const templates = [
    `item watch: ${item.name}\n${price}${supplyPart}${listingsPart}\n\ndo what you will with this info. ${itemUrl(item.slug)}`,
    `${item.name} update: ${price}${supplyPart}${listingsPart}.\n\n${itemUrl(item.slug)}`,
    `currently on the S&box market: ${item.name} at ${price}${supplyPart}.\n\nchart, order book, the whole 9: ${itemUrl(item.slug)}`,
    `${item.name}. ${price}.${supplyPart}${listingsPart}. you love to see it.\n\n${itemUrl(item.slug)}`,
  ];
  const text = seedPick(templates);
  return { kind: "item-spotlight", text, itemSlug: item.slug, approxLength: approximateLength(text) };
}

export async function genLimitedEdition(): Promise<GeneratedTweet | null> {
  const limited = await prisma.item.findMany({
    where: { isLimited: true, currentPrice: { not: null, gt: 0 } },
    orderBy: { currentPrice: "desc" },
    take: 5,
  });
  if (limited.length === 0) return null;

  const item = limited[Math.floor(Math.random() * limited.length)];
  const price = formatPrice(item.currentPrice!);
  const supplyPart = item.totalSupply ? ` · ${item.totalSupply.toLocaleString()} exist, no more coming` : "";

  const templates = [
    `${item.name} is limited edition. translation: your cousin can't get one anymore. ${price}${supplyPart}.\n\n${itemUrl(item.slug)}`,
    `capped supply alert: ${item.name}. no new ones being minted ever again. ${price}${supplyPart}.\n\n${itemUrl(item.slug)}`,
    `${item.name} = no refills. what's minted is minted. ${price}${supplyPart}.\n\n${itemUrl(item.slug)}`,
    `limited edition check: ${item.name}. ${price}${supplyPart}. math it out how you want.\n\n${itemUrl(item.slug)}`,
  ];
  const text = seedPick(templates);
  return { kind: "limited-edition", text, itemSlug: item.slug, approxLength: approximateLength(text) };
}

// ----- Entry points -----

/** Generate one specific kind of tweet on demand (for the admin UI). */
export async function generateTweet(kind: TweetKind): Promise<GeneratedTweet | null> {
  switch (kind) {
    case "top-gainer": return genTopGainer();
    case "top-loser": return genTopLoser();
    case "rarest": return genRarest();
    case "market-cap": return genMarketCap();
    case "item-spotlight": return genItemSpotlight();
    case "limited-edition": return genLimitedEdition();
    case "new-high": return null; // reserved
  }
}

/** Generate 3 different draft variations for the admin UI. */
export async function generateDrafts(): Promise<GeneratedTweet[]> {
  const kinds: TweetKind[] = ["top-gainer", "top-loser", "rarest", "market-cap", "item-spotlight", "limited-edition"];
  const results = await Promise.all(kinds.map((k) => generateTweet(k)));
  return results.filter((r): r is GeneratedTweet => r !== null);
}

/**
 * Pick a sensible tweet for the scheduled cron — rotates through kinds on a
 * daily basis to avoid posting the same pattern every day.
 */
export async function pickScheduledTweet(): Promise<GeneratedTweet | null> {
  // Rotate by day-of-year so each day gets a different tweet type
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86_400_000,
  );

  const rotation: TweetKind[] = [
    "top-gainer",
    "item-spotlight",
    "rarest",
    "market-cap",
    "top-loser",
    "limited-edition",
    "item-spotlight",
  ];

  // Try primary, fall through to others if primary has no data
  const order = [rotation[dayOfYear % rotation.length], ...rotation];
  for (const kind of order) {
    const tweet = await generateTweet(kind);
    if (tweet) return tweet;
  }
  return null;
}
