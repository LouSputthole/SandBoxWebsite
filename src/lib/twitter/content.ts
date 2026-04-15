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
    // loose / wendy's
    `${item.name} up ${pct}% today. somebody really wants this.\n\n${price} · ${itemUrl(item.slug)}`,
    `today's winner: ${item.name} (+${pct}%). line go up ${price}.\n\n${itemUrl(item.slug)}`,
    `${item.name} popped ${pct}% in 24h. ${price}. don't ask us, ask the buyers.\n\n${itemUrl(item.slug)}`,
    // analytical
    `24h top mover: ${item.name}, +${pct}% to ${price}. Live chart and full order book → ${itemUrl(item.slug)}`,
    `Biggest S&box price move today: ${item.name} +${pct}% · ${price}.\nHistorical chart: ${itemUrl(item.slug)}`,
    // hype / collector
    `${item.name} is absolutely eating today 🚀 +${pct}% to ${price}\n${itemUrl(item.slug)}`,
    `${item.name} holders waking up happy. +${pct}% overnight, sitting at ${price}.\n${itemUrl(item.slug)}`,
    // CS comparison
    `${item.name} up ${pct}% in 24h — the kind of move CS skins took weeks to make in 2015. ${price}.\n${itemUrl(item.slug)}`,
    `S&box is where CS was 10 years ago. ${item.name} just ran +${pct}% to ${price}. don't say we didn't warn you.\n${itemUrl(item.slug)}`,
    // newsy / short
    `📈 ${item.name} +${pct}% · ${price}\n${itemUrl(item.slug)}`,
    // community
    `Who's been watching ${item.name}? Up ${pct}% today at ${price}. Calling it or fading it?\n${itemUrl(item.slug)}`,
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
    // loose / wendy's
    `rough day for ${item.name}. down ${pct}% at ${price}. paper hands are real out here.\n\n${itemUrl(item.slug)}`,
    `${item.name} took an L today (-${pct}%). sitting at ${price} now. dip or death spiral? you decide.\n\n${itemUrl(item.slug)}`,
    `${item.name}: -${pct}%. ${price}. someone's writing a breakup text to their inventory rn.\n\n${itemUrl(item.slug)}`,
    `${item.name} down ${pct}%. just reporting the news, not writing it.\n\n${price} · ${itemUrl(item.slug)}`,
    // analytical
    `Biggest 24h decline: ${item.name} at -${pct}% · ${price}. Historical chart: ${itemUrl(item.slug)}`,
    `${item.name} closed -${pct}% over the last 24 hours at ${price}. Full price history → ${itemUrl(item.slug)}`,
    // hype / dip-buyer angle
    `Buy-the-dip alert? ${item.name} off ${pct}% to ${price}.\n${itemUrl(item.slug)}`,
    `${item.name} just did a ${pct}% flash sale (not by choice). ${price}.\n${itemUrl(item.slug)}`,
    // CS comparison
    `${item.name} -${pct}% today. CS traders know — the biggest dips are usually the best entries. ${price}.\n${itemUrl(item.slug)}`,
    `Reminder: CS Dragon Lore was under $100 once. Today ${item.name} is ${price}, down ${pct}%.\n${itemUrl(item.slug)}`,
    // newsy
    `📉 ${item.name} -${pct}% · ${price}\n${itemUrl(item.slug)}`,
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
    // loose / wendy's
    `only ${supply} of ${item.name} exist. that's it. that's the tweet.${priceNote}\n\n${itemUrl(item.slug)}`,
    `${item.name}: ${supply} in circulation. rarer than a quiet S&box Discord.${priceNote}\n\n${itemUrl(item.slug)}`,
    `rarest S&box skin on record: ${item.name} at ${supply} total.${priceNote} own it or envy it.\n\n${itemUrl(item.slug)}`,
    `${supply}. that's how many ${item.name}s will ever exist.${priceNote}\n\n${itemUrl(item.slug)}`,
    // analytical
    `Rarest S&box skin currently tracked: ${item.name}, total supply ${supply}.${priceNote} ${itemUrl(item.slug)}`,
    `Scarcity check → ${item.name}: ${supply} exist, ${priceNote.trim()} ${itemUrl(item.slug)}`,
    // hype / collector
    `Serious collectors know → ${item.name}. ${supply} exist, ever.${priceNote} ${itemUrl(item.slug)}`,
    `${supply} ${item.name}s in the world. If you own one, screenshot it for the grandkids.${priceNote}\n${itemUrl(item.slug)}`,
    // CS comparison
    `${item.name} has ${supply} total supply. CS Souvenir Dragon Lores have roughly ~${Math.floor(item.totalSupply / 50)}x that count.${priceNote}\n${itemUrl(item.slug)}`,
    `S&box scarcity is hitting levels CS collectors understand instantly. ${item.name} = ${supply} total.${priceNote} ${itemUrl(item.slug)}`,
    `CS skin traders: imagine if Butterfly Fade had ${supply} copies. That's ${item.name} right now.${priceNote} ${itemUrl(item.slug)}`,
    // community
    `Trivia: rarest S&box skin we track is ${item.name} with ${supply} in existence.${priceNote}\n${itemUrl(item.slug)}`,
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
    // loose / wendy's
    `${cap} floating around in S&box skins right now. try explaining that at thanksgiving.\n\n${SITE}`,
    `state of the S&box economy:\n${cap} market cap, ${totalListings.toLocaleString()} listings, ${items.length} skins tracked. we just built the spreadsheet.\n\n${SITE}`,
    `daily PSA: S&box skins are a ${cap} market. your hat hobby is an asset class now.\n\n${SITE}`,
    `${cap} in hats, shoes, and face tattoos. the S&box economy is doing numbers.\n\n${SITE}`,
    // analytical
    `S&box skin market snapshot:\n• Market cap: ${cap}\n• Active listings: ${totalListings.toLocaleString()}\n• Tracked items: ${items.length}\n\n${SITE}`,
    `Market cap across all ${items.length} tracked S&box skins: ${cap}. Updated every 15–30 min.\n\n${SITE}`,
    // hype
    `${cap} S&box skin market and climbing 🚀 This is just the start.\n\n${SITE}`,
    `${items.length} skins, ${cap} market cap, thousands of listings. The S&box economy is here.\n\n${SITE}`,
    // CS comparison
    `S&box market cap: ${cap}. For reference, that's roughly equivalent to a single AK-47 Case Hardened Blue Gem at auction. Room to grow.\n\n${SITE}`,
    `CS:GO skin market took 5 years to hit $1B. S&box sitting at ${cap} already. Math it out.\n\n${SITE}`,
    `Everyone who traded CS skins in 2014 is nodding rn. S&box market: ${cap}.\n\n${SITE}`,
    // newsy
    `📊 S&box market cap: ${cap} · ${totalListings.toLocaleString()} listings · ${items.length} tracked items\n${SITE}`,
    // community
    `Where we at fam → ${cap} S&box skin economy. ${items.length} items, ${totalListings.toLocaleString()} listings.\n\n${SITE}`,
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
    // loose / wendy's
    `item watch: ${item.name}\n${price}${supplyPart}${listingsPart}\n\ndo what you will with this info. ${itemUrl(item.slug)}`,
    `${item.name} update: ${price}${supplyPart}${listingsPart}.\n\n${itemUrl(item.slug)}`,
    `currently on the S&box market: ${item.name} at ${price}${supplyPart}.\n\nchart, order book, the whole 9: ${itemUrl(item.slug)}`,
    `${item.name}. ${price}.${supplyPart}${listingsPart}. you love to see it.\n\n${itemUrl(item.slug)}`,
    // analytical
    `Spotlight: ${item.name}\nPrice: ${price}${supplyPart}${listingsPart}\nFull chart: ${itemUrl(item.slug)}`,
    `${item.name} — current: ${price}${supplyPart}${listingsPart}.\nLive order book → ${itemUrl(item.slug)}`,
    // hype / collector
    `${item.name} is a whole vibe. ${price}${supplyPart}.\n${itemUrl(item.slug)}`,
    `You seen ${item.name} yet? ${price}${supplyPart}${listingsPart}.\n${itemUrl(item.slug)}`,
    // CS comparison
    `${item.name} for ${price}. CS traders spend more on cases. Just saying.\n${itemUrl(item.slug)}`,
    `If you liked flipping CS skins, ${item.name} at ${price} is the kind of play worth watching.\n${itemUrl(item.slug)}`,
    // newsy / factual
    `👕 ${item.name} · ${price}${supplyPart}${listingsPart}\n${itemUrl(item.slug)}`,
    // community
    `Anyone holding ${item.name}? ${price}${supplyPart}. Thoughts?\n${itemUrl(item.slug)}`,
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
    // loose / wendy's
    `${item.name} is limited edition. translation: your cousin can't get one anymore. ${price}${supplyPart}.\n\n${itemUrl(item.slug)}`,
    `capped supply alert: ${item.name}. no new ones being minted ever again. ${price}${supplyPart}.\n\n${itemUrl(item.slug)}`,
    `${item.name} = no refills. what's minted is minted. ${price}${supplyPart}.\n\n${itemUrl(item.slug)}`,
    `limited edition check: ${item.name}. ${price}${supplyPart}. math it out how you want.\n\n${itemUrl(item.slug)}`,
    // analytical
    `${item.name} — limited edition status, supply fixed${supplyPart ? ":" + supplyPart : "."}. Current price: ${price}. ${itemUrl(item.slug)}`,
    // hype / collector
    `Capped supply S&box skin: ${item.name} 🔒 ${price}${supplyPart}. Grails behave like grails.\n${itemUrl(item.slug)}`,
    `Limited editions > regulars. ${item.name} is one of them. ${price}${supplyPart}.\n${itemUrl(item.slug)}`,
    // CS comparison
    `${item.name} is the S&box equivalent of a discontinued CS case. Supply capped. ${price}${supplyPart}.\n${itemUrl(item.slug)}`,
    `CS collectors get it: discontinued = appreciation. ${item.name} is capped-supply at ${price}${supplyPart}.\n${itemUrl(item.slug)}`,
    `Like CS souvenir skins from Cologne 2014 — finite supply, growing demand. ${item.name} at ${price}${supplyPart}.\n${itemUrl(item.slug)}`,
    // newsy
    `🔒 Limited: ${item.name} · ${price}${supplyPart}\n${itemUrl(item.slug)}`,
    // community
    `Heads up for S&box collectors: ${item.name} is limited edition. ${price}${supplyPart}.\n${itemUrl(item.slug)}`,
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
