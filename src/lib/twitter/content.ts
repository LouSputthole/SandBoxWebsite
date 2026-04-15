import { prisma } from "@/lib/db";
import { formatPrice } from "@/lib/utils";

export type TweetKind =
  | "top-gainer"
  | "top-loser"
  | "rarest"
  | "market-cap"
  | "item-spotlight"
  | "new-high"
  | "limited-edition"
  | "weekly-gainer"
  | "weekly-loser"
  | "weekly-recap"
  | "weekly-market-change"
  | "market-insight";

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

// ----- Weekly tweet generators -----

/**
 * Find the price of each item roughly 7 days ago by querying PricePoint.
 * Returns a map of itemId -> price-7d-ago (or null if we don't have history).
 */
async function getWeekAgoPrices(): Promise<Map<string, number>> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  // For each item, find the price point closest to 7 days ago
  const points = await prisma.pricePoint.findMany({
    where: { timestamp: { lte: new Date(weekAgo.getTime() + 12 * 60 * 60 * 1000) } },
    orderBy: { timestamp: "desc" },
    select: { itemId: true, price: true, timestamp: true },
  });

  // Keep the newest point per item that's still <= weekAgo+12h
  const map = new Map<string, number>();
  for (const p of points) {
    if (!map.has(p.itemId)) {
      map.set(p.itemId, p.price);
    }
  }
  return map;
}

interface ItemWithWeekly {
  id: string;
  name: string;
  slug: string;
  currentPrice: number | null;
  weekAgoPrice: number;
  weeklyChangePct: number;
}

async function getWeeklyChanges(): Promise<ItemWithWeekly[]> {
  const [items, weekAgoMap] = await Promise.all([
    prisma.item.findMany({
      where: { currentPrice: { not: null, gt: 0 } },
      select: { id: true, name: true, slug: true, currentPrice: true },
    }),
    getWeekAgoPrices(),
  ]);

  const withWeekly: ItemWithWeekly[] = [];
  for (const item of items) {
    const weekAgoPrice = weekAgoMap.get(item.id);
    if (!weekAgoPrice || !item.currentPrice || weekAgoPrice <= 0) continue;
    const pct = ((item.currentPrice - weekAgoPrice) / weekAgoPrice) * 100;
    withWeekly.push({ ...item, weekAgoPrice, weeklyChangePct: pct });
  }
  return withWeekly;
}

export async function genWeeklyGainer(): Promise<GeneratedTweet | null> {
  const items = await getWeeklyChanges();
  const gainers = items
    .filter((i) => i.weeklyChangePct > 0)
    .sort((a, b) => b.weeklyChangePct - a.weeklyChangePct);
  const item = gainers[0];
  if (!item) return null;

  const pct = item.weeklyChangePct.toFixed(1);
  const price = formatPrice(item.currentPrice!);
  const wasPrice = formatPrice(item.weekAgoPrice);

  const templates = [
    // loose / wendy's
    `weekly winner: ${item.name} up ${pct}% over the last 7 days. ${wasPrice} → ${price}. someone's feeling smug.\n${itemUrl(item.slug)}`,
    `${item.name} ate well this week. +${pct}% from ${wasPrice} to ${price}.\n${itemUrl(item.slug)}`,
    // analytical
    `Biggest 7-day S&box mover: ${item.name} +${pct}% (${wasPrice} → ${price}).\nFull chart → ${itemUrl(item.slug)}`,
    `Weekly top performer: ${item.name}, ${pct}% gain over 7 days. Current: ${price}.\n${itemUrl(item.slug)}`,
    // hype
    `${item.name} had a WEEK 🚀 up ${pct}% to ${price}. You seen this chart?\n${itemUrl(item.slug)}`,
    `Holders of ${item.name} eating good. +${pct}% on the week at ${price}.\n${itemUrl(item.slug)}`,
    // CS comparison
    `${item.name} +${pct}% this week. That's the kind of weekly move CS traders circle on their charts.\n${price} · ${itemUrl(item.slug)}`,
    `${item.name} 7-day run: +${pct}%. Feels like watching a CS skin break out of a consolidation range.\n${itemUrl(item.slug)}`,
    // newsy
    `📈 Weekly top gainer: ${item.name} +${pct}% · ${wasPrice} → ${price}\n${itemUrl(item.slug)}`,
    // community
    `Week recap — ${item.name} was the biggest winner, up ${pct}% at ${price}. Anyone catch this one?\n${itemUrl(item.slug)}`,
  ];
  const text = seedPick(templates);
  return { kind: "weekly-gainer", text, itemSlug: item.slug, approxLength: approximateLength(text) };
}

export async function genWeeklyLoser(): Promise<GeneratedTweet | null> {
  const items = await getWeeklyChanges();
  const losers = items
    .filter((i) => i.weeklyChangePct < 0)
    .sort((a, b) => a.weeklyChangePct - b.weeklyChangePct);
  const item = losers[0];
  if (!item) return null;

  const pct = Math.abs(item.weeklyChangePct).toFixed(1);
  const price = formatPrice(item.currentPrice!);
  const wasPrice = formatPrice(item.weekAgoPrice);

  const templates = [
    // loose / wendy's
    `tough week for ${item.name}. down ${pct}% from ${wasPrice} to ${price}. happens to the best of us.\n${itemUrl(item.slug)}`,
    `${item.name} had a week. not in a good way. -${pct}% at ${price}.\n${itemUrl(item.slug)}`,
    // analytical
    `Biggest 7-day S&box decline: ${item.name} at -${pct}% (${wasPrice} → ${price}).\n${itemUrl(item.slug)}`,
    `${item.name} closed the week -${pct}%, sitting at ${price}. Chart: ${itemUrl(item.slug)}`,
    // dip-buyer angle
    `Week's biggest dip: ${item.name} down ${pct}% to ${price}. Interesting entry or falling knife?\n${itemUrl(item.slug)}`,
    // CS comparison
    `${item.name} -${pct}% this week. CS traders know weekly dips this deep sometimes precede solid bounces.\n${price} · ${itemUrl(item.slug)}`,
    // newsy
    `📉 Weekly top loser: ${item.name} -${pct}% · ${wasPrice} → ${price}\n${itemUrl(item.slug)}`,
    // community
    `Weekly recap — ${item.name} took the biggest L at -${pct}% (${price}). Holding or dumping?\n${itemUrl(item.slug)}`,
  ];
  const text = seedPick(templates);
  return { kind: "weekly-loser", text, itemSlug: item.slug, approxLength: approximateLength(text) };
}

export async function genWeeklyRecap(): Promise<GeneratedTweet | null> {
  const items = await getWeeklyChanges();
  if (items.length < 3) return null;

  const gainers = items
    .filter((i) => i.weeklyChangePct > 0)
    .sort((a, b) => b.weeklyChangePct - a.weeklyChangePct)
    .slice(0, 3);
  const losers = items
    .filter((i) => i.weeklyChangePct < 0)
    .sort((a, b) => a.weeklyChangePct - b.weeklyChangePct)
    .slice(0, 2);

  if (gainers.length === 0) return null;

  // Build a compact recap — up to 3 gainers, up to 2 losers
  const gainerLines = gainers
    .map((g) => `• ${g.name} +${g.weeklyChangePct.toFixed(1)}%`)
    .join("\n");
  const loserLines = losers
    .map((l) => `• ${l.name} ${l.weeklyChangePct.toFixed(1)}%`)
    .join("\n");

  const templates = [
    `S&box weekly recap 📊\n\nTop movers up:\n${gainerLines}\n\nTop movers down:\n${loserLines}\n\n${SITE}`,
    `this week in S&box skins:\n\nwinners:\n${gainerLines}\n\nlosers:\n${loserLines}\n\nfull charts → ${SITE}`,
    `Weekly S&box market recap:\n\n🟢 Best performers\n${gainerLines}\n\n🔴 Worst performers\n${loserLines}\n\n${SITE}`,
    `7-day S&box recap\n\nWINS\n${gainerLines}\n\nLOSSES\n${loserLines}\n\n${SITE}`,
  ];
  const text = seedPick(templates);
  return { kind: "weekly-recap", text, approxLength: approximateLength(text) };
}

export async function genWeeklyMarketChange(): Promise<GeneratedTweet | null> {
  // Compare current market cap to market cap 7 days ago via MarketSnapshot
  // or estimate from price history.
  const items = await prisma.item.findMany({
    select: { currentPrice: true, volume: true },
  });
  if (items.length === 0) return null;

  const currentCap = items.reduce(
    (sum, i) => sum + (i.currentPrice ?? 0) * (i.volume ?? 0),
    0,
  );

  // Try MarketSnapshot for last-week reference
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const oldSnap = await prisma.marketSnapshot.findFirst({
    where: { timestamp: { lte: new Date(weekAgo.getTime() + 12 * 60 * 60 * 1000) } },
    orderBy: { timestamp: "desc" },
  });

  if (!oldSnap || !oldSnap.marketCap || oldSnap.marketCap <= 0) {
    // Fallback: just report current cap without a delta
    return null;
  }

  const changePct = ((currentCap - oldSnap.marketCap) / oldSnap.marketCap) * 100;
  const direction = changePct >= 0 ? "+" : "";
  const arrow = changePct >= 0 ? "📈" : "📉";
  const currentCapFmt = formatPrice(currentCap);
  const oldCapFmt = formatPrice(oldSnap.marketCap);

  const templates = [
    `S&box market cap this week: ${oldCapFmt} → ${currentCapFmt} (${direction}${changePct.toFixed(1)}%) ${arrow}\n\n${SITE}`,
    `Week-over-week S&box skin economy: ${direction}${changePct.toFixed(1)}%. ${oldCapFmt} → ${currentCapFmt}.\n${SITE}`,
    `the S&box market did a ${direction}${changePct.toFixed(1)}% this week. cap went from ${oldCapFmt} to ${currentCapFmt}.\n\n${SITE}`,
    `7 days ago S&box skins were a ${oldCapFmt} market. now: ${currentCapFmt}. ${direction}${changePct.toFixed(1)}%.\n${SITE}`,
  ];
  const text = seedPick(templates);
  return { kind: "weekly-market-change", text, approxLength: approximateLength(text) };
}

/**
 * Big-picture market analysis tweet. Synthesizes multiple signals from the
 * past week into a narrative take: market cap change, gainer/loser ratio,
 * average movement, most notable single mover.
 *
 * Adapts tone based on what the data shows:
 *   bullish  — majority gainers, cap up, positive avg
 *   bearish  — majority losers, cap down, negative avg
 *   volatile — wide std dev, mixed signals, at least one big mover
 *   stable   — everything within ±5%
 */
export async function genMarketInsight(): Promise<GeneratedTweet | null> {
  const weekAgoChanges = await getWeeklyChanges();
  if (weekAgoChanges.length < 5) return null;

  const gainers = weekAgoChanges.filter((i) => i.weeklyChangePct > 0);
  const losers = weekAgoChanges.filter((i) => i.weeklyChangePct < 0);
  const bigMovers = weekAgoChanges.filter((i) => Math.abs(i.weeklyChangePct) >= 10);
  const biggestAbsMover = [...weekAgoChanges].sort(
    (a, b) => Math.abs(b.weeklyChangePct) - Math.abs(a.weeklyChangePct),
  )[0];
  const avgChange =
    weekAgoChanges.reduce((s, i) => s + i.weeklyChangePct, 0) / weekAgoChanges.length;
  const gainerPct = (gainers.length / weekAgoChanges.length) * 100;

  // Market cap delta via MarketSnapshot (if available)
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [currentItems, oldSnap] = await Promise.all([
    prisma.item.findMany({ select: { currentPrice: true, volume: true } }),
    prisma.marketSnapshot.findFirst({
      where: { timestamp: { lte: new Date(weekAgo.getTime() + 12 * 60 * 60 * 1000) } },
      orderBy: { timestamp: "desc" },
    }),
  ]);
  const currentCap = currentItems.reduce(
    (sum, i) => sum + (i.currentPrice ?? 0) * (i.volume ?? 0),
    0,
  );
  const capDelta =
    oldSnap?.marketCap && oldSnap.marketCap > 0
      ? ((currentCap - oldSnap.marketCap) / oldSnap.marketCap) * 100
      : null;

  // Classify sentiment
  type Sentiment = "bullish" | "bearish" | "volatile" | "stable";
  let sentiment: Sentiment = "stable";
  if (bigMovers.length >= 3 && Math.abs(avgChange) < 3) {
    sentiment = "volatile";
  } else if (gainerPct > 60 && avgChange > 2) {
    sentiment = "bullish";
  } else if (gainerPct < 40 && avgChange < -2) {
    sentiment = "bearish";
  } else if (Math.abs(avgChange) < 1.5 && bigMovers.length === 0) {
    sentiment = "stable";
  } else {
    // default to volatile if there's at least one big mover, otherwise stable
    sentiment = bigMovers.length > 0 ? "volatile" : "stable";
  }

  const capClause = capDelta != null
    ? ` Market cap ${capDelta >= 0 ? "+" : ""}${capDelta.toFixed(1)}%.`
    : "";
  const moverClause = biggestAbsMover
    ? ` Biggest mover: ${biggestAbsMover.name} ${biggestAbsMover.weeklyChangePct >= 0 ? "+" : ""}${biggestAbsMover.weeklyChangePct.toFixed(0)}%.`
    : "";

  // Tone-specific templates
  const templatesBySentiment: Record<Sentiment, string[]> = {
    bullish: [
      `S&box skin market had a week 📈 ${gainers.length} of ${weekAgoChanges.length} tracked items posted gains.${capClause}${moverClause}\n\n${SITE}`,
      `Bullish run across S&box skins — average +${avgChange.toFixed(1)}% on the week, ${gainerPct.toFixed(0)}% of items in the green.${capClause}\n${SITE}`,
      `The last 7 days in S&box: ${gainers.length} up, ${losers.length} down.${capClause}${moverClause} Not a bad stretch to be holding.\n\n${SITE}`,
      `Quiet bull market vibes 🐂 — most S&box skins trending up this week, avg +${avgChange.toFixed(1)}%.${capClause}\n${SITE}`,
    ],
    bearish: [
      `Tough week for S&box skins. ${losers.length} of ${weekAgoChanges.length} items down, avg ${avgChange.toFixed(1)}%.${capClause}${moverClause}\n\n${SITE}`,
      `S&box market took some hits this week 📉 avg ${avgChange.toFixed(1)}%, ${losers.length} items lower.${capClause} Could be accumulation window.\n${SITE}`,
      `Red across the board — ${gainerPct.toFixed(0)}% of S&box skins in the green this week (below 50 = bears in charge).${capClause}${moverClause}\n\n${SITE}`,
      `Brutal stretch for holders. ${losers.length} of ${weekAgoChanges.length} S&box skins traded lower over 7d.${capClause} Watchlist time.\n${SITE}`,
    ],
    volatile: [
      `Chop city this week in S&box 🎢 ${bigMovers.length} skins moved 10%+ in either direction.${moverClause}${capClause}\n\nFull movers: ${SITE}/trends`,
      `S&box market = whipsaws this week. ${gainers.length} up, ${losers.length} down, ${bigMovers.length} big movers.${moverClause}\n${SITE}/trends`,
      `Volatility alert: ${bigMovers.length} S&box skins posted moves >10% in 7d.${moverClause}${capClause} If you like action, this is your week.\n\n${SITE}/trends`,
      `Not a quiet week — S&box had ${bigMovers.length} double-digit movers.${moverClause}${capClause} Traders eating good.\n${SITE}/trends`,
    ],
    stable: [
      `S&box market: boring week (in a good way). avg ${avgChange >= 0 ? "+" : ""}${avgChange.toFixed(1)}%, no 10%+ movers.${capClause}\n\n${SITE}`,
      `Quiet 7 days for S&box skins. ${gainerPct.toFixed(0)}% of items in the green, nothing wild.${capClause} Consolidation phase.\n${SITE}`,
      `Calm market this week. S&box skin prices holding range-bound, avg ${avgChange >= 0 ? "+" : ""}${avgChange.toFixed(1)}%.${capClause}\n\n${SITE}`,
      `No fireworks in S&box this week — most items within a couple percent of last week's close.${capClause}\n${SITE}`,
    ],
  };

  const text = seedPick(templatesBySentiment[sentiment]);
  return { kind: "market-insight", text, approxLength: approximateLength(text) };
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
    case "weekly-gainer": return genWeeklyGainer();
    case "weekly-loser": return genWeeklyLoser();
    case "weekly-recap": return genWeeklyRecap();
    case "weekly-market-change": return genWeeklyMarketChange();
    case "market-insight": return genMarketInsight();
    case "new-high": return null; // reserved
  }
}

/** Generate 3 different draft variations for the admin UI. */
export async function generateDrafts(): Promise<GeneratedTweet[]> {
  const kinds: TweetKind[] = [
    "top-gainer",
    "top-loser",
    "rarest",
    "market-cap",
    "item-spotlight",
    "limited-edition",
    "weekly-gainer",
    "weekly-loser",
    "weekly-recap",
    "weekly-market-change",
    "market-insight",
  ];
  const results = await Promise.all(kinds.map((k) => generateTweet(k)));
  return results.filter((r): r is GeneratedTweet => r !== null);
}

/**
 * Pick a weekly-flavored tweet for the Friday cron. Tries weekly-recap first,
 * then falls back to individual weekly kinds if that doesn't have enough data.
 */
export async function pickWeeklyTweet(): Promise<GeneratedTweet | null> {
  const order: TweetKind[] = [
    "weekly-recap",
    "weekly-gainer",
    "market-insight",
    "weekly-market-change",
    "weekly-loser",
  ];
  for (const kind of order) {
    const tweet = await generateTweet(kind);
    if (tweet) return tweet;
  }
  return null;
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
