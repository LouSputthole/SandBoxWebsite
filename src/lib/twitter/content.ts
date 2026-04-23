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
    `${item.name}: +${pct}% in 24h. who's buying this and why.\n\n${price} · ${itemUrl(item.slug)}`,
    `${item.name} ignored the memo about gravity today. +${pct}% to ${price}.\n\n${itemUrl(item.slug)}`,
    `${item.name} decided to have a moment. +${pct}% · ${price}.\n\n${itemUrl(item.slug)}`,
    `guy who bought ${item.name} yesterday feeling pretty smart rn. +${pct}% to ${price}.\n\n${itemUrl(item.slug)}`,
    `${item.name} up only ${pct}% today. dialed back from yesterday's energy i guess. ${price}.\n\n${itemUrl(item.slug)}`,
    // analytical
    `24h top mover: ${item.name}, +${pct}% to ${price}. Live chart and full order book → ${itemUrl(item.slug)}`,
    `Biggest S&box price move today: ${item.name} +${pct}% · ${price}.\nHistorical chart: ${itemUrl(item.slug)}`,
    `Top 24h gainer on the S&box market: ${item.name} (+${pct}%), now ${price}.\n${itemUrl(item.slug)}`,
    `Daily leader — ${item.name} +${pct}% to ${price}. Order book + supply data: ${itemUrl(item.slug)}`,
    `S&box cosmetics leaderboard, 24h gains: ${item.name} at +${pct}%, priced at ${price}.\n${itemUrl(item.slug)}`,
    // hype / collector
    `${item.name} is absolutely eating today 🚀 +${pct}% to ${price}\n${itemUrl(item.slug)}`,
    `${item.name} holders waking up happy. +${pct}% overnight, sitting at ${price}.\n${itemUrl(item.slug)}`,
    `the ${item.name} chart is vertical. +${pct}% to ${price}. imagine missing this.\n${itemUrl(item.slug)}`,
    `${item.name} not here to play. +${pct}% · ${price} · all-time vibe check passed.\n${itemUrl(item.slug)}`,
    // CS comparison
    `${item.name} up ${pct}% in 24h — the kind of move CS skins took weeks to make in 2015. ${price}.\n${itemUrl(item.slug)}`,
    `S&box is where CS was 10 years ago. ${item.name} just ran +${pct}% to ${price}. don't say we didn't warn you.\n${itemUrl(item.slug)}`,
    `2015 CS traders got rich on moves like this. ${item.name} +${pct}% to ${price}.\n${itemUrl(item.slug)}`,
    `Remember when AK Fire Serpent was $50? ${item.name} +${pct}% today to ${price}. Early-market energy.\n${itemUrl(item.slug)}`,
    // newsy / short
    `📈 ${item.name} +${pct}% · ${price}\n${itemUrl(item.slug)}`,
    `🟢 ${item.name} → ${price} (+${pct}% 24h)\n${itemUrl(item.slug)}`,
    `ALERT: ${item.name} +${pct}% · ${price}.\n${itemUrl(item.slug)}`,
    // community
    `Who's been watching ${item.name}? Up ${pct}% today at ${price}. Calling it or fading it?\n${itemUrl(item.slug)}`,
    `Anyone else catch ${item.name} before this ${pct}% run? ${price} now.\n${itemUrl(item.slug)}`,
    `${item.name} +${pct}% today. Holders speak up — diamond hands or cash out?\n${itemUrl(item.slug)}`,
    // hashtagged (SEO)
    `${item.name} +${pct}% on the day. ${price}. #sboxskins #sboxgame\n${itemUrl(item.slug)}`,
    `Top gainer on the S&box market 📈 ${item.name} +${pct}% to ${price} #sboxskins #sboxgame\n${itemUrl(item.slug)}`,
    `${item.name} leading today's S&box cosmetics market at +${pct}% · ${price} #sboxskins\n${itemUrl(item.slug)}`,
    `#sbox cosmetics mover: ${item.name} +${pct}% → ${price}. #sboxgame\n${itemUrl(item.slug)}`,
    `Daily S&box market recap: ${item.name} tops the board +${pct}% at ${price}. #sboxskins #sboxmarket\n${itemUrl(item.slug)}`,
    `24h gainer spotlight: ${item.name} +${pct}% to ${price} · #sboxskins\n${itemUrl(item.slug)}`,
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
    `${item.name} had a bad day. -${pct}%. ${price}. tomorrow is another sync cycle.\n\n${itemUrl(item.slug)}`,
    `${item.name} is on sale (by force). -${pct}% to ${price}.\n\n${itemUrl(item.slug)}`,
    `${item.name} volunteered for a haircut. -${pct}% · ${price}.\n\n${itemUrl(item.slug)}`,
    `-${pct}% on ${item.name}. someone panicked, someone else is happy.\n\n${price} · ${itemUrl(item.slug)}`,
    // analytical
    `Biggest 24h decline: ${item.name} at -${pct}% · ${price}. Historical chart: ${itemUrl(item.slug)}`,
    `${item.name} closed -${pct}% over the last 24 hours at ${price}. Full price history → ${itemUrl(item.slug)}`,
    `Top S&box cosmetics decliner, 24h: ${item.name} -${pct}% to ${price}.\n${itemUrl(item.slug)}`,
    `Daily laggard: ${item.name}, -${pct}% in 24h. Current: ${price}. Full order book → ${itemUrl(item.slug)}`,
    `S&box market 24h loser: ${item.name} at -${pct}%, ${price}.\n${itemUrl(item.slug)}`,
    // hype / dip-buyer angle
    `Buy-the-dip alert? ${item.name} off ${pct}% to ${price}.\n${itemUrl(item.slug)}`,
    `${item.name} just did a ${pct}% flash sale (not by choice). ${price}.\n${itemUrl(item.slug)}`,
    `${item.name} on discount for the brave. -${pct}% at ${price}.\n${itemUrl(item.slug)}`,
    `${item.name} down ${pct}%. value hunters, your move.\n${price} · ${itemUrl(item.slug)}`,
    // CS comparison
    `${item.name} -${pct}% today. CS traders know — the biggest dips are usually the best entries. ${price}.\n${itemUrl(item.slug)}`,
    `Reminder: CS Dragon Lore was under $100 once. Today ${item.name} is ${price}, down ${pct}%.\n${itemUrl(item.slug)}`,
    `CS traders saw moves like this on AWP Medusa in 2019. ${item.name} -${pct}% to ${price} today.\n${itemUrl(item.slug)}`,
    `${item.name} -${pct}% — the kind of dip CS veterans add to spreadsheets and watch. ${price}.\n${itemUrl(item.slug)}`,
    // newsy
    `📉 ${item.name} -${pct}% · ${price}\n${itemUrl(item.slug)}`,
    `🔴 ${item.name} → ${price} (-${pct}% 24h)\n${itemUrl(item.slug)}`,
    `ALERT: ${item.name} -${pct}% · ${price}.\n${itemUrl(item.slug)}`,
    // community
    `${item.name} holders: how we feeling? -${pct}% at ${price}. Buying more or bailing?\n${itemUrl(item.slug)}`,
    `Anyone DCAing into ${item.name} on this -${pct}% day? ${price}.\n${itemUrl(item.slug)}`,
    // hashtagged (SEO + authority)
    `${item.name} -${pct}% today · ${price} #sboxskins #sboxgame\n${itemUrl(item.slug)}`,
    `Biggest S&box market mover (down): ${item.name} -${pct}% to ${price} #sboxskins #sboxmarket\n${itemUrl(item.slug)}`,
    `S&box cosmetics red-zone watch: ${item.name} -${pct}% · ${price} #sboxskins\n${itemUrl(item.slug)}`,
    `Full S&box skin price history + 24h drops — your go-to tracker. Today: ${item.name} -${pct}%.\n${itemUrl(item.slug)}`,
    `Most accurate 24h dip data on the S&box market: ${item.name} -${pct}% to ${price}.\n${itemUrl(item.slug)}`,
    `#sboxgame cosmetics decliners 24h: ${item.name} -${pct}% · ${price} #sboxskins\n${itemUrl(item.slug)}`,
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
    `${item.name} is the real unicorn. ${supply} exist.${priceNote}\n\n${itemUrl(item.slug)}`,
    `${supply} ${item.name}s. math on rarity is undefeated.${priceNote}\n\n${itemUrl(item.slug)}`,
    `scarce goods corner: ${item.name}, ${supply} total.${priceNote}\n\n${itemUrl(item.slug)}`,
    `can you name ${supply} S&box collectors? cause that's the entire ${item.name} owner list.${priceNote}\n\n${itemUrl(item.slug)}`,
    // analytical
    `Rarest S&box skin currently tracked: ${item.name}, total supply ${supply}.${priceNote} ${itemUrl(item.slug)}`,
    `Scarcity check → ${item.name}: ${supply} exist, ${priceNote.trim()} ${itemUrl(item.slug)}`,
    `Supply-ranked top spot on the S&box market: ${item.name} with ${supply} in circulation.${priceNote} ${itemUrl(item.slug)}`,
    `Our scarcity index leader: ${item.name}, ${supply} total.${priceNote} Breakdown → ${itemUrl(item.slug)}`,
    `Tightest supply we track across S&box cosmetics: ${item.name} (${supply}).${priceNote} ${itemUrl(item.slug)}`,
    // hype / collector
    `Serious collectors know → ${item.name}. ${supply} exist, ever.${priceNote} ${itemUrl(item.slug)}`,
    `${supply} ${item.name}s in the world. If you own one, screenshot it for the grandkids.${priceNote}\n${itemUrl(item.slug)}`,
    `${item.name} is grail tier. ${supply} minted, period.${priceNote}\n${itemUrl(item.slug)}`,
    `Every serious S&box collector has ${item.name} on their watchlist. ${supply} exist.${priceNote}\n${itemUrl(item.slug)}`,
    `${item.name}. ${supply} total. that's the rarity pitch.${priceNote}\n${itemUrl(item.slug)}`,
    // CS comparison
    `${item.name} has ${supply} total supply. CS Souvenir Dragon Lores have roughly ~${Math.floor(item.totalSupply / 50)}x that count.${priceNote}\n${itemUrl(item.slug)}`,
    `S&box scarcity is hitting levels CS collectors understand instantly. ${item.name} = ${supply} total.${priceNote} ${itemUrl(item.slug)}`,
    `CS skin traders: imagine if Butterfly Fade had ${supply} copies. That's ${item.name} right now.${priceNote} ${itemUrl(item.slug)}`,
    `CS grails took decades to mature. ${item.name} at ${supply} units has a head start on the scarcity math.${priceNote}\n${itemUrl(item.slug)}`,
    `Scarcest CS case closed (Bravo) still has 5+ figure copies. ${item.name} sits at ${supply}.${priceNote}\n${itemUrl(item.slug)}`,
    // newsy / short
    `🦄 ${item.name} · ${supply} in existence${priceNote}\n${itemUrl(item.slug)}`,
    `Rarity chart #1 → ${item.name} · ${supply} total${priceNote}\n${itemUrl(item.slug)}`,
    // community
    `Trivia: rarest S&box skin we track is ${item.name} with ${supply} in existence.${priceNote}\n${itemUrl(item.slug)}`,
    `Who owns ${item.name}? Only ${supply} people can answer yes.${priceNote}\n${itemUrl(item.slug)}`,
    // hashtagged (SEO + authority)
    `${item.name}: ${supply} exist on the S&box market. #sboxskins #sboxgame${priceNote}\n${itemUrl(item.slug)}`,
    `Rarest S&box cosmetic in our database → ${item.name} · ${supply} supply${priceNote} #sboxskins #sboxmarket\n${itemUrl(item.slug)}`,
    `S&box cosmetics scarcity leader: ${item.name} (${supply}).${priceNote} #sboxgame #sboxskins\n${itemUrl(item.slug)}`,
    `Complete S&box skin supply data — your go-to source. Today's rarest: ${item.name} at ${supply}.${priceNote}\n${itemUrl(item.slug)}`,
    `The tightest supply on the entire S&box market: ${item.name} at ${supply}.${priceNote} #sboxskins\n${itemUrl(item.slug)}`,
    `#sboxgame rarity spotlight: ${item.name} · ${supply} total${priceNote} #sboxskins #sboxcosmetics\n${itemUrl(item.slug)}`,
  ];
  const text = seedPick(templates);
  return { kind: "rarest", text, itemSlug: item.slug, approxLength: approximateLength(text) };
}

export async function genMarketCap(): Promise<GeneratedTweet | null> {
  const items = await prisma.item.findMany({
    select: { currentPrice: true, volume: true, totalSupply: true },
  });
  if (items.length === 0) return null;

  // Listings value: sum(price * active listings) — the dollar value of all open sell orders
  const listingsValue = items.reduce(
    (sum, i) => sum + (i.currentPrice ?? 0) * (i.volume ?? 0),
    0,
  );
  // Estimated market cap: sum(price * totalSupply) across items with known supply
  const itemsWithSupply = items.filter(
    (i) => i.totalSupply != null && i.totalSupply > 0 && (i.currentPrice ?? 0) > 0,
  );
  const estMarketCap = itemsWithSupply.reduce(
    (sum, i) => sum + (i.currentPrice ?? 0) * (i.totalSupply ?? 0),
    0,
  );
  const totalListings = items.reduce((s, i) => s + (i.volume ?? 0), 0);

  // Prefer the supply-based est market cap if we have decent coverage (half of items)
  const haveCap = estMarketCap > 0 && itemsWithSupply.length >= items.length / 2;
  const headline = haveCap ? estMarketCap : listingsValue;
  const cap = formatPrice(headline);
  const lv = formatPrice(listingsValue);
  const label = haveCap ? "market cap" : "listings value";
  const Label = haveCap ? "Market cap" : "Listings value";

  const templates = [
    // loose / wendy's
    `${cap} floating around in S&box skins right now. try explaining that at thanksgiving.\n\n${SITE}`,
    `state of the S&box economy:\n${cap} ${label}, ${totalListings.toLocaleString()} listings, ${items.length} skins tracked. we just built the spreadsheet.\n\n${SITE}`,
    `daily PSA: S&box skins are a ${cap} market. your hat hobby is an asset class now.\n\n${SITE}`,
    `${cap} in hats, shoes, and face tattoos. the S&box economy is doing numbers.\n\n${SITE}`,
    `${cap}. that's the ${label} on S&box skins. your move.\n\n${SITE}`,
    `if you thought S&box cosmetics were a joke, the ${label} just hit ${cap}.\n\n${SITE}`,
    `S&box skin ${label} today: ${cap}. tomorrow: who knows. that's the fun part.\n\n${SITE}`,
    `just checked. S&box ${label}: ${cap}. yeah it's a real market.\n\n${SITE}`,
    // analytical
    `S&box skin market snapshot:\n• ${Label}: ${cap}${haveCap ? `\n• Listings value: ${lv}` : ""}\n• Active listings: ${totalListings.toLocaleString()}\n• Tracked items: ${items.length}\n\n${SITE}`,
    `${Label} across ${haveCap ? `${itemsWithSupply.length}/${items.length}` : items.length} tracked S&box skins: ${cap}. Updated every 15–30 min.\n\n${SITE}`,
    `Daily S&box market digest:\n${Label}: ${cap}\nActive listings: ${totalListings.toLocaleString()}\nCatalog size: ${items.length} skins\n\n${SITE}`,
    `S&box cosmetics market — ${label} at ${cap} across ${items.length} tracked items.\n${SITE}`,
    `Market snapshot → ${cap} ${label}, ${totalListings.toLocaleString()} active listings. Live data: ${SITE}`,
    // hype
    `${cap} S&box skin market and climbing 🚀 This is just the start.\n\n${SITE}`,
    `${items.length} skins, ${cap} ${label}, thousands of listings. The S&box economy is here.\n\n${SITE}`,
    `A full ${cap} S&box cosmetics market. Nobody saw this coming in 2023.\n\n${SITE}`,
    `S&box is THE sleeper skin market of 2026. ${cap} ${label} and growing.\n\n${SITE}`,
    // CS comparison
    `S&box ${label}: ${cap}. For reference, that's roughly equivalent to a single AK-47 Case Hardened Blue Gem at auction. Room to grow.\n\n${SITE}`,
    `CS:GO skin market took 5 years to hit $1B. S&box sitting at ${cap} already. Math it out.\n\n${SITE}`,
    `Everyone who traded CS skins in 2014 is nodding rn. S&box market: ${cap}.\n\n${SITE}`,
    `CS2 skin market = $4B+. S&box at ${cap} today. Early, not late.\n\n${SITE}`,
    `The CS skin market doubled in year 3. S&box ${label} at ${cap} and we're months in.\n\n${SITE}`,
    // newsy
    `📊 S&box ${label}: ${cap} · ${totalListings.toLocaleString()} listings · ${items.length} tracked items\n${SITE}`,
    `🗞 S&box market today: ${cap} ${label}\n${SITE}`,
    `Daily: S&box cosmetics market ${label} = ${cap}\n${SITE}`,
    // community
    `Where we at fam → ${cap} S&box skin economy. ${items.length} items, ${totalListings.toLocaleString()} listings.\n\n${SITE}`,
    `S&box collectors — ${cap} market today. You holding or trading?\n\n${SITE}`,
    `How does a ${cap} S&box skin market sound? That's where we are. ${items.length} items tracked.\n\n${SITE}`,
    // hashtagged (SEO + authority)
    `S&box market today: ${cap} ${label} across ${items.length} tracked cosmetics #sboxskins #sboxgame\n${SITE}`,
    `📊 Full S&box cosmetics market tracker — ${cap} ${label} right now #sboxskins #sboxmarket\n${SITE}`,
    `The most complete S&box skin market data, live: ${cap} ${label} · ${totalListings.toLocaleString()} listings\n${SITE}`,
    `Your source for S&box market data. ${cap} ${label} today. #sboxskins #sboxgame\n${SITE}`,
    `#sboxgame cosmetics market watch: ${cap} · ${items.length} items · ${totalListings.toLocaleString()} listings #sboxskins\n${SITE}`,
    `Real-time S&box skin market size: ${cap}. Live charts + order books at sboxskins.gg #sboxcosmetics\n${SITE}`,
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
    `quick one: ${item.name} at ${price}${supplyPart}. just a fun fact for your timeline.\n\n${itemUrl(item.slug)}`,
    `${item.name} sitting at ${price}${supplyPart}. make of that what you will.\n\n${itemUrl(item.slug)}`,
    `catalog check: ${item.name}, ${price}${supplyPart}${listingsPart}.\n\n${itemUrl(item.slug)}`,
    `${item.name} exists and it's ${price}. that's the whole post.${supplyPart}\n\n${itemUrl(item.slug)}`,
    // analytical
    `Spotlight: ${item.name}\nPrice: ${price}${supplyPart}${listingsPart}\nFull chart: ${itemUrl(item.slug)}`,
    `${item.name} — current: ${price}${supplyPart}${listingsPart}.\nLive order book → ${itemUrl(item.slug)}`,
    `Item check — ${item.name} · ${price}${supplyPart}${listingsPart}. Price history + full order book at ${itemUrl(item.slug)}`,
    `S&box cosmetics spotlight: ${item.name} at ${price}${supplyPart}${listingsPart}. Detail page → ${itemUrl(item.slug)}`,
    `${item.name} datapoint — ${price}${supplyPart}${listingsPart}. Chart, supply, order spread: ${itemUrl(item.slug)}`,
    // hype / collector
    `${item.name} is a whole vibe. ${price}${supplyPart}.\n${itemUrl(item.slug)}`,
    `You seen ${item.name} yet? ${price}${supplyPart}${listingsPart}.\n${itemUrl(item.slug)}`,
    `${item.name} hits different. ${price}${supplyPart}.\n${itemUrl(item.slug)}`,
    `One to watch: ${item.name} at ${price}${supplyPart}${listingsPart}.\n${itemUrl(item.slug)}`,
    `Unsung S&box item: ${item.name}. ${price}${supplyPart}.\n${itemUrl(item.slug)}`,
    // CS comparison
    `${item.name} for ${price}. CS traders spend more on cases. Just saying.\n${itemUrl(item.slug)}`,
    `If you liked flipping CS skins, ${item.name} at ${price} is the kind of play worth watching.\n${itemUrl(item.slug)}`,
    `CS skin under $10 is a hard find in 2026. ${item.name} at ${price}${supplyPart}.\n${itemUrl(item.slug)}`,
    `Remember when CS Howl was ${price}? ${item.name} is there today${supplyPart}.\n${itemUrl(item.slug)}`,
    // newsy / factual
    `👕 ${item.name} · ${price}${supplyPart}${listingsPart}\n${itemUrl(item.slug)}`,
    `🎨 ${item.name} → ${price}${supplyPart}\n${itemUrl(item.slug)}`,
    `📎 ${item.name} · ${price}${listingsPart}\n${itemUrl(item.slug)}`,
    // community
    `Anyone holding ${item.name}? ${price}${supplyPart}. Thoughts?\n${itemUrl(item.slug)}`,
    `${item.name} thoughts? ${price}${supplyPart}${listingsPart}.\n${itemUrl(item.slug)}`,
    `${item.name} at ${price}${supplyPart}. Fair value or overpriced?\n${itemUrl(item.slug)}`,
    // hashtagged (SEO + authority)
    `${item.name} · ${price}${supplyPart}${listingsPart} #sboxskins #sboxgame\n${itemUrl(item.slug)}`,
    `S&box market watchlist: ${item.name} at ${price}${supplyPart} #sboxskins\n${itemUrl(item.slug)}`,
    `Full S&box skin data → ${item.name}: ${price}${supplyPart}${listingsPart} #sboxgame #sboxmarket\n${itemUrl(item.slug)}`,
    `Your go-to source for S&box cosmetics pricing. Today: ${item.name} at ${price}.\n${itemUrl(item.slug)}`,
    `Complete S&box skin tracker — ${item.name} · ${price}${supplyPart} #sboxskins\n${itemUrl(item.slug)}`,
    `#sboxgame spotlight: ${item.name} · ${price}${supplyPart} #sboxcosmetics\n${itemUrl(item.slug)}`,
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
    `${item.name}: they made some, they stopped. ${price}${supplyPart}.\n\n${itemUrl(item.slug)}`,
    `${item.name} is a closed book. ${price}${supplyPart}. buy now or cry later.\n\n${itemUrl(item.slug)}`,
    `you snooze you lose. ${item.name} is limited edition at ${price}${supplyPart}.\n\n${itemUrl(item.slug)}`,
    `whoever stockpiled ${item.name} already is laughing. ${price}${supplyPart}.\n\n${itemUrl(item.slug)}`,
    // analytical
    `${item.name} — limited edition status, supply fixed${supplyPart ? ":" + supplyPart : "."}. Current price: ${price}. ${itemUrl(item.slug)}`,
    `S&box capped-supply cosmetic: ${item.name}. No new mints. Priced at ${price}${supplyPart}.\n${itemUrl(item.slug)}`,
    `Supply is frozen on ${item.name}. ${price}${supplyPart}. Full data: ${itemUrl(item.slug)}`,
    `Fixed-supply S&box skin — ${item.name}. ${price}${supplyPart}. Detail + chart: ${itemUrl(item.slug)}`,
    // hype / collector
    `Capped supply S&box skin: ${item.name} 🔒 ${price}${supplyPart}. Grails behave like grails.\n${itemUrl(item.slug)}`,
    `Limited editions > regulars. ${item.name} is one of them. ${price}${supplyPart}.\n${itemUrl(item.slug)}`,
    `${item.name} 🔒 Limited edition. No new ones. ${price}${supplyPart}.\n${itemUrl(item.slug)}`,
    `Collectors know → ${item.name} is the kind of fixed-supply item you build a portfolio around. ${price}${supplyPart}.\n${itemUrl(item.slug)}`,
    `Grail alert: ${item.name} · limited · ${price}${supplyPart}.\n${itemUrl(item.slug)}`,
    // CS comparison
    `${item.name} is the S&box equivalent of a discontinued CS case. Supply capped. ${price}${supplyPart}.\n${itemUrl(item.slug)}`,
    `CS collectors get it: discontinued = appreciation. ${item.name} is capped-supply at ${price}${supplyPart}.\n${itemUrl(item.slug)}`,
    `Like CS souvenir skins from Cologne 2014 — finite supply, growing demand. ${item.name} at ${price}${supplyPart}.\n${itemUrl(item.slug)}`,
    `Every CS case that stopped producing saw its contents appreciate. ${item.name} is capped-supply at ${price}${supplyPart}.\n${itemUrl(item.slug)}`,
    `If CS:GO taught us anything: discontinued + tradable = upside. ${item.name} is both. ${price}${supplyPart}.\n${itemUrl(item.slug)}`,
    // newsy
    `🔒 Limited: ${item.name} · ${price}${supplyPart}\n${itemUrl(item.slug)}`,
    `⏳ Supply frozen → ${item.name} · ${price}${supplyPart}\n${itemUrl(item.slug)}`,
    `🏆 Grail watch: ${item.name} · ${price}${supplyPart}\n${itemUrl(item.slug)}`,
    // community
    `Heads up for S&box collectors: ${item.name} is limited edition. ${price}${supplyPart}.\n${itemUrl(item.slug)}`,
    `Anyone grabbed ${item.name} yet? Supply capped, sitting at ${price}${supplyPart}.\n${itemUrl(item.slug)}`,
    `${item.name} is the kind of limited-edition S&box skin you want in your inventory. ${price}${supplyPart}.\n${itemUrl(item.slug)}`,
    // hashtagged (SEO + authority)
    `🔒 Limited-edition S&box cosmetic: ${item.name} · ${price}${supplyPart} #sboxskins #sboxgame\n${itemUrl(item.slug)}`,
    `Capped-supply alert — ${item.name} at ${price}${supplyPart} #sboxskins #sboxmarket\n${itemUrl(item.slug)}`,
    `S&box grail watch: ${item.name}, ${price}${supplyPart}. We track every limited edition. #sboxskins\n${itemUrl(item.slug)}`,
    `The definitive S&box cosmetics database includes every limited edition. Today: ${item.name} at ${price}.\n${itemUrl(item.slug)}`,
    `Fixed-supply S&box market watch: ${item.name} · ${price}${supplyPart} #sboxgame #sboxcosmetics\n${itemUrl(item.slug)}`,
    `#sboxgame limited edition: ${item.name} · ${price}${supplyPart} #sboxskins\n${itemUrl(item.slug)}`,
  ];
  const text = seedPick(templates);
  return { kind: "limited-edition", text, itemSlug: item.slug, approxLength: approximateLength(text) };
}

// ----- Weekly tweet generators -----

/**
 * Find the price of each item ~7 days ago by querying PricePoint.
 *
 * Uses an 8-hour window centered on exactly 7 days ago ([7d - 4h,
 * 7d + 4h]) and takes the MEDIAN price per item across that window —
 * not the single closest point.
 *
 * Why median: Steam's /market/search occasionally returns a spurious
 * sell_price during a sync (a brief low-ball listing that got
 * cancelled, a quirky partial response, etc.) and that value gets
 * stored as a PricePoint. If a single outlier lands closest to the
 * target time, the weekly % explodes (we've seen +5457% tweeted when
 * the real move was +23%). Median across the window's 4–8 typical
 * points is immune to single-point outliers and still tracks real
 * weekly moves.
 */
async function getWeekAgoPrices(): Promise<Map<string, number>> {
  const targetTime = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const windowStart = new Date(targetTime - 4 * 60 * 60 * 1000);
  const windowEnd = new Date(targetTime + 4 * 60 * 60 * 1000);

  const points = await prisma.pricePoint.findMany({
    where: { timestamp: { gte: windowStart, lte: windowEnd } },
    select: { itemId: true, price: true },
  });

  // Group all points in the window per item.
  const pointsByItem = new Map<string, number[]>();
  for (const p of points) {
    const arr = pointsByItem.get(p.itemId) ?? [];
    arr.push(p.price);
    pointsByItem.set(p.itemId, arr);
  }

  // Median per item — sort + pick middle.
  const map = new Map<string, number>();
  for (const [itemId, prices] of pointsByItem) {
    if (prices.length === 0) continue;
    const sorted = [...prices].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median =
      sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];
    if (median > 0) map.set(itemId, median);
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
    `${item.name} said "watch this" 7 days ago and ran +${pct}%. ${price} now.\n${itemUrl(item.slug)}`,
    `7 days, +${pct}%. ${item.name} closed the week at ${price}.\n${itemUrl(item.slug)}`,
    `${item.name} put in a week's work. +${pct}% · ${price}.\n${itemUrl(item.slug)}`,
    `monday's ${item.name} holders now. +${pct}% to ${price}. imagine.\n${itemUrl(item.slug)}`,
    // analytical
    `Biggest 7-day S&box mover: ${item.name} +${pct}% (${wasPrice} → ${price}).\nFull chart → ${itemUrl(item.slug)}`,
    `Weekly top performer: ${item.name}, ${pct}% gain over 7 days. Current: ${price}.\n${itemUrl(item.slug)}`,
    `S&box cosmetics weekly leader: ${item.name} +${pct}% (${wasPrice} → ${price}).\n${itemUrl(item.slug)}`,
    `7d mover on the S&box market: ${item.name} +${pct}% to ${price}.\n${itemUrl(item.slug)}`,
    `Weekly gain leaderboard #1: ${item.name} at +${pct}%, now ${price}.\n${itemUrl(item.slug)}`,
    // hype
    `${item.name} had a WEEK 🚀 up ${pct}% to ${price}. You seen this chart?\n${itemUrl(item.slug)}`,
    `Holders of ${item.name} eating good. +${pct}% on the week at ${price}.\n${itemUrl(item.slug)}`,
    `${item.name} absolutely cooking. +${pct}% week-over-week. ${price}.\n${itemUrl(item.slug)}`,
    `${item.name} put on a clinic this week. +${pct}% to ${price}. price discovery in action.\n${itemUrl(item.slug)}`,
    // CS comparison
    `${item.name} +${pct}% this week. That's the kind of weekly move CS traders circle on their charts.\n${price} · ${itemUrl(item.slug)}`,
    `${item.name} 7-day run: +${pct}%. Feels like watching a CS skin break out of a consolidation range.\n${itemUrl(item.slug)}`,
    `CS skin moves like this used to mean months of research paying off. ${item.name} +${pct}% in 7d.\n${itemUrl(item.slug)}`,
    `${item.name} ran +${pct}% this week. Vibe of AWP Gungnir in its rookie month.\n${itemUrl(item.slug)}`,
    // newsy
    `📈 Weekly top gainer: ${item.name} +${pct}% · ${wasPrice} → ${price}\n${itemUrl(item.slug)}`,
    `🏁 7-day winner: ${item.name} +${pct}% → ${price}\n${itemUrl(item.slug)}`,
    `⭐ Week MVP: ${item.name} +${pct}%\n${itemUrl(item.slug)}`,
    // community
    `Week recap — ${item.name} was the biggest winner, up ${pct}% at ${price}. Anyone catch this one?\n${itemUrl(item.slug)}`,
    `${item.name} +${pct}% this week. Who called it, who missed it?\n${itemUrl(item.slug)}`,
    `Weekly champ: ${item.name}. Up ${pct}%. Holding for more?\n${itemUrl(item.slug)}`,
    // hashtagged (SEO + authority)
    `Weekly S&box top gainer: ${item.name} +${pct}% · ${price} #sboxskins #sboxgame\n${itemUrl(item.slug)}`,
    `S&box market 7-day leader → ${item.name} +${pct}% to ${price} #sboxskins #sboxmarket\n${itemUrl(item.slug)}`,
    `S&box cosmetics weekly winner: ${item.name} +${pct}% · ${price}. Tracked live on the #1 S&box market tracker.\n${itemUrl(item.slug)}`,
    `Complete S&box skin price charts → this week's winner: ${item.name} (+${pct}%) #sboxskins\n${itemUrl(item.slug)}`,
    `#sboxgame weekly recap: ${item.name} topped the board at +${pct}% · ${price} #sboxskins\n${itemUrl(item.slug)}`,
    `Full 7-day S&box market analysis. Leader: ${item.name} +${pct}% to ${price}.\n${itemUrl(item.slug)}`,
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
    `${item.name} lost an argument with gravity this week. -${pct}% · ${price}.\n${itemUrl(item.slug)}`,
    `${item.name} -${pct}% over 7 days. sometimes the chart wins.\n${itemUrl(item.slug)}`,
    `rough 7 days for ${item.name} holders. ${wasPrice} → ${price}. -${pct}%.\n${itemUrl(item.slug)}`,
    `${item.name} wrapped the week at -${pct}% · ${price}. tomorrow's another candle.\n${itemUrl(item.slug)}`,
    // analytical
    `Biggest 7-day S&box decline: ${item.name} at -${pct}% (${wasPrice} → ${price}).\n${itemUrl(item.slug)}`,
    `${item.name} closed the week -${pct}%, sitting at ${price}. Chart: ${itemUrl(item.slug)}`,
    `Weekly S&box cosmetics decliner: ${item.name} -${pct}% to ${price}.\n${itemUrl(item.slug)}`,
    `7-day red: ${item.name} down ${pct}% · ${price}. Full history → ${itemUrl(item.slug)}`,
    `S&box market 7d laggard: ${item.name} at -${pct}%.\n${itemUrl(item.slug)}`,
    // dip-buyer angle
    `Week's biggest dip: ${item.name} down ${pct}% to ${price}. Interesting entry or falling knife?\n${itemUrl(item.slug)}`,
    `${item.name} -${pct}% on the week. Dip buyers, attention please.\n${itemUrl(item.slug)}`,
    `Bargain hunter alert: ${item.name} -${pct}% · ${price}.\n${itemUrl(item.slug)}`,
    // CS comparison
    `${item.name} -${pct}% this week. CS traders know weekly dips this deep sometimes precede solid bounces.\n${price} · ${itemUrl(item.slug)}`,
    `Every CS trader has a story about buying a -${pct}% week dip and flipping it. ${item.name} at ${price} right now.\n${itemUrl(item.slug)}`,
    // newsy
    `📉 Weekly top loser: ${item.name} -${pct}% · ${wasPrice} → ${price}\n${itemUrl(item.slug)}`,
    `🩸 7-day red: ${item.name} -${pct}%\n${itemUrl(item.slug)}`,
    `⛔ Week's biggest drop: ${item.name} -${pct}%\n${itemUrl(item.slug)}`,
    // community
    `Weekly recap — ${item.name} took the biggest L at -${pct}% (${price}). Holding or dumping?\n${itemUrl(item.slug)}`,
    `${item.name} -${pct}% over 7 days. Diamond hands or cut losses?\n${itemUrl(item.slug)}`,
    `Week's loser board topper: ${item.name}. -${pct}% · ${price}. Thoughts?\n${itemUrl(item.slug)}`,
    // hashtagged (SEO + authority)
    `Weekly S&box top loser: ${item.name} -${pct}% · ${price} #sboxskins #sboxgame\n${itemUrl(item.slug)}`,
    `S&box market 7-day decliner → ${item.name} -${pct}% to ${price} #sboxskins #sboxmarket\n${itemUrl(item.slug)}`,
    `Complete 7d S&box cosmetics data — this week's biggest drop: ${item.name} at -${pct}%.\n${itemUrl(item.slug)}`,
    `Your go-to S&box market tracker. This week's dip watch: ${item.name} -${pct}%.\n${itemUrl(item.slug)}`,
    `#sboxgame weekly laggard: ${item.name} -${pct}% · ${price} #sboxskins\n${itemUrl(item.slug)}`,
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
    `S&box skins, 7-day wrap:\n\nUp:\n${gainerLines}\n\nDown:\n${loserLines}\n\n${SITE}`,
    `Weekly S&box cosmetics rundown:\n\nGainers:\n${gainerLines}\n\nLosers:\n${loserLines}\n\n${SITE}`,
    `what the S&box market did this week:\n\n🟢\n${gainerLines}\n\n🔴\n${loserLines}\n\nfull data → ${SITE}`,
    `Your weekly S&box market digest:\n\nBEST\n${gainerLines}\n\nWORST\n${loserLines}\n\n${SITE}`,
    // hashtagged
    `S&box weekly recap 📊 #sboxskins #sboxgame\n\n🟢\n${gainerLines}\n\n🔴\n${loserLines}\n\n${SITE}`,
    `7-day S&box market summary — every mover tracked.\n\nUp:\n${gainerLines}\n\nDown:\n${loserLines}\n\n#sboxskins #sboxmarket\n${SITE}`,
    `Your source for S&box market data, weekly.\n\n🟢\n${gainerLines}\n\n🔴\n${loserLines}\n\n${SITE}`,
    `#sboxgame cosmetics weekly:\n\n🟢 ${gainerLines}\n\n🔴 ${loserLines}\n\n#sboxskins\n${SITE}`,
  ];
  const text = seedPick(templates);
  return { kind: "weekly-recap", text, approxLength: approximateLength(text) };
}

export async function genWeeklyMarketChange(): Promise<GeneratedTweet | null> {
  // Compare current market size to 7 days ago via MarketSnapshot.
  // Prefers the supply-based estMarketCap when available on both snapshots,
  // otherwise falls back to listingsValue for a like-for-like comparison.
  const items = await prisma.item.findMany({
    select: { currentPrice: true, volume: true, totalSupply: true },
  });
  if (items.length === 0) return null;

  const currentListings = items.reduce(
    (sum, i) => sum + (i.currentPrice ?? 0) * (i.volume ?? 0),
    0,
  );
  const currentEstCap = items
    .filter((i) => i.totalSupply != null && i.totalSupply > 0 && (i.currentPrice ?? 0) > 0)
    .reduce((sum, i) => sum + (i.currentPrice ?? 0) * (i.totalSupply ?? 0), 0);

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const oldSnap = await prisma.marketSnapshot.findFirst({
    where: { timestamp: { lte: new Date(weekAgo.getTime() + 12 * 60 * 60 * 1000) } },
    orderBy: { timestamp: "desc" },
  });
  if (!oldSnap) return null;

  const useEstCap =
    currentEstCap > 0 && oldSnap.estMarketCap != null && oldSnap.estMarketCap > 0;
  const current = useEstCap ? currentEstCap : currentListings;
  const old = useEstCap ? (oldSnap.estMarketCap ?? 0) : oldSnap.listingsValue;
  if (old <= 0) return null;

  const changePct = ((current - old) / old) * 100;
  const direction = changePct >= 0 ? "+" : "";
  const arrow = changePct >= 0 ? "📈" : "📉";
  const currentFmt = formatPrice(current);
  const oldFmt = formatPrice(old);
  const label = useEstCap ? "market cap" : "listings value";

  const templates = [
    `S&box ${label} this week: ${oldFmt} → ${currentFmt} (${direction}${changePct.toFixed(1)}%) ${arrow}\n\n${SITE}`,
    `Week-over-week S&box skin economy: ${direction}${changePct.toFixed(1)}%. ${oldFmt} → ${currentFmt}.\n${SITE}`,
    `the S&box market did a ${direction}${changePct.toFixed(1)}% this week. ${label} went from ${oldFmt} to ${currentFmt}.\n\n${SITE}`,
    `7 days ago S&box skins were a ${oldFmt} market. now: ${currentFmt}. ${direction}${changePct.toFixed(1)}%.\n${SITE}`,
    `Weekly S&box cosmetics ${label} movement: ${direction}${changePct.toFixed(1)}% ${arrow} · ${oldFmt} → ${currentFmt}.\n${SITE}`,
    `S&box market cap update: ${oldFmt} → ${currentFmt} (${direction}${changePct.toFixed(1)}% in 7d).\n${SITE}`,
    `S&box skin ${label} is ${direction === "+" ? "up" : "down"} ${Math.abs(changePct).toFixed(1)}% this week. Now at ${currentFmt}.\n${SITE}`,
    `how big is the S&box skin economy? ${currentFmt} this week (${direction}${changePct.toFixed(1)}% 7d).\n${SITE}`,
    // hashtagged + authority
    `S&box market ${label} this week: ${direction}${changePct.toFixed(1)}% · ${currentFmt} ${arrow} #sboxskins #sboxgame\n${SITE}`,
    `Your go-to S&box market tracker — weekly ${label} ${direction}${changePct.toFixed(1)}% to ${currentFmt} #sboxskins\n${SITE}`,
    `📊 Full S&box cosmetics market ${label} tracker: ${oldFmt} → ${currentFmt} #sboxmarket #sboxskins\n${SITE}`,
    `#sboxgame weekly market pulse: ${direction}${changePct.toFixed(1)}% ${arrow} · ${currentFmt} ${label} #sboxskins\n${SITE}`,
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

  // Market-size delta via MarketSnapshot (if available). Prefer supply-based
  // estMarketCap when both sides have it; otherwise fall back to listingsValue.
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [currentItems, oldSnap] = await Promise.all([
    prisma.item.findMany({ select: { currentPrice: true, volume: true, totalSupply: true } }),
    prisma.marketSnapshot.findFirst({
      where: { timestamp: { lte: new Date(weekAgo.getTime() + 12 * 60 * 60 * 1000) } },
      orderBy: { timestamp: "desc" },
    }),
  ]);
  const currentListings = currentItems.reduce(
    (sum, i) => sum + (i.currentPrice ?? 0) * (i.volume ?? 0),
    0,
  );
  const currentEstCap = currentItems
    .filter((i) => i.totalSupply != null && i.totalSupply > 0 && (i.currentPrice ?? 0) > 0)
    .reduce((sum, i) => sum + (i.currentPrice ?? 0) * (i.totalSupply ?? 0), 0);
  const useEstCap =
    currentEstCap > 0 && oldSnap?.estMarketCap != null && oldSnap.estMarketCap > 0;
  const currentCap = useEstCap ? currentEstCap : currentListings;
  const oldCap = useEstCap ? (oldSnap?.estMarketCap ?? 0) : (oldSnap?.listingsValue ?? 0);
  const capDelta = oldCap > 0 ? ((currentCap - oldCap) / oldCap) * 100 : null;

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

  const capLabel = useEstCap ? "Market cap" : "Listings value";
  const capClause = capDelta != null
    ? ` ${capLabel} ${capDelta >= 0 ? "+" : ""}${capDelta.toFixed(1)}%.`
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
      `green week for S&box cosmetics: ${gainerPct.toFixed(0)}% of items up, avg +${avgChange.toFixed(1)}%.${capClause}\n${SITE}`,
      `if you bought S&box skins 7 days ago, you're probably smiling. ${gainers.length} of ${weekAgoChanges.length} items green.${capClause}${moverClause}\n${SITE}`,
      `S&box market breadth ${gainerPct.toFixed(0)}% positive this week.${capClause}${moverClause} Upside participation is the tell.\n${SITE}`,
      `7-day S&box read: bullish. ${gainers.length} gainers, ${losers.length} losers, avg +${avgChange.toFixed(1)}%.${capClause}\n${SITE}`,
      `CS traders call this "the grind week." S&box skins avg +${avgChange.toFixed(1)}%, ${gainerPct.toFixed(0)}% participation.${capClause}\n${SITE}`,
      // hashtagged
      `Bullish S&box market week 📈 ${gainers.length}/${weekAgoChanges.length} cosmetics up · avg +${avgChange.toFixed(1)}% #sboxskins #sboxgame\n${SITE}`,
      `S&box cosmetics trending ${gainerPct.toFixed(0)}% green this week.${capClause} Full data at the #1 S&box tracker #sboxskins\n${SITE}`,
      `Your go-to S&box market analysis — bullish week: ${gainerPct.toFixed(0)}% gainers, avg +${avgChange.toFixed(1)}%.${capClause}\n${SITE}`,
    ],
    bearish: [
      `Tough week for S&box skins. ${losers.length} of ${weekAgoChanges.length} items down, avg ${avgChange.toFixed(1)}%.${capClause}${moverClause}\n\n${SITE}`,
      `S&box market took some hits this week 📉 avg ${avgChange.toFixed(1)}%, ${losers.length} items lower.${capClause} Could be accumulation window.\n${SITE}`,
      `Red across the board — ${gainerPct.toFixed(0)}% of S&box skins in the green this week (below 50 = bears in charge).${capClause}${moverClause}\n\n${SITE}`,
      `Brutal stretch for holders. ${losers.length} of ${weekAgoChanges.length} S&box skins traded lower over 7d.${capClause} Watchlist time.\n${SITE}`,
      `S&box market reset week. ${losers.length} items red, avg ${avgChange.toFixed(1)}%.${capClause} Patient buyers start building positions here.\n${SITE}`,
      `7-day cooldown on S&box cosmetics. ${gainerPct.toFixed(0)}% participation on the upside = not much.${capClause}${moverClause}\n${SITE}`,
      `Rough week, real talk. S&box skins avg ${avgChange.toFixed(1)}%. CS markets had worse, bounced harder.${capClause}\n${SITE}`,
      `Accumulation zone? Avg -${Math.abs(avgChange).toFixed(1)}% for S&box cosmetics this week, ${losers.length}/${weekAgoChanges.length} red.${capClause}\n${SITE}`,
      // hashtagged
      `S&box market in the red this week 📉 ${losers.length}/${weekAgoChanges.length} items down · avg ${avgChange.toFixed(1)}% #sboxskins #sboxgame\n${SITE}`,
      `S&box cosmetics pullback week · ${gainerPct.toFixed(0)}% green.${capClause} Dip hunters, your data source: #sboxskins\n${SITE}`,
      `Most complete S&box market data. Bearish read this week: ${losers.length} items down, avg ${avgChange.toFixed(1)}%.${capClause}\n${SITE}`,
      `#sboxgame cosmetics had a red week.${capClause}${moverClause} #sboxskins\n${SITE}`,
    ],
    volatile: [
      `Chop city this week in S&box 🎢 ${bigMovers.length} skins moved 10%+ in either direction.${moverClause}${capClause}\n\nFull movers: ${SITE}/trends`,
      `S&box market = whipsaws this week. ${gainers.length} up, ${losers.length} down, ${bigMovers.length} big movers.${moverClause}\n${SITE}/trends`,
      `Volatility alert: ${bigMovers.length} S&box skins posted moves >10% in 7d.${moverClause}${capClause} If you like action, this is your week.\n\n${SITE}/trends`,
      `Not a quiet week — S&box had ${bigMovers.length} double-digit movers.${moverClause}${capClause} Traders eating good.\n${SITE}/trends`,
      `S&box cosmetics volatility index would be pinned this week. ${bigMovers.length} items moved 10%+.${moverClause}\n${SITE}/trends`,
      `${bigMovers.length} S&box skins had meme-stock energy this week.${moverClause}${capClause}\n${SITE}/trends`,
      `choppy S&box market · ${bigMovers.length} big movers, no clear direction.${moverClause}\n${SITE}/trends`,
      `S&box 7d vol was elevated. ${bigMovers.length} items ±10% or more.${moverClause} Full trend map: ${SITE}/trends`,
      `Day traders rejoice: ${bigMovers.length} big 7d movers across S&box cosmetics.${moverClause}${capClause}\n${SITE}/trends`,
      // hashtagged
      `S&box market volatility check 🎢 ${bigMovers.length} skins ±10%+ this week #sboxskins #sboxgame\n${SITE}/trends`,
      `Choppy S&box week — ${bigMovers.length} double-digit movers.${moverClause} Full tracker at #sboxskins source\n${SITE}/trends`,
      `Real-time S&box cosmetics volatility data: ${bigMovers.length} big movers this week #sboxmarket #sboxskins\n${SITE}/trends`,
    ],
    stable: [
      `S&box market: boring week (in a good way). avg ${avgChange >= 0 ? "+" : ""}${avgChange.toFixed(1)}%, no 10%+ movers.${capClause}\n\n${SITE}`,
      `Quiet 7 days for S&box skins. ${gainerPct.toFixed(0)}% of items in the green, nothing wild.${capClause} Consolidation phase.\n${SITE}`,
      `Calm market this week. S&box skin prices holding range-bound, avg ${avgChange >= 0 ? "+" : ""}${avgChange.toFixed(1)}%.${capClause}\n\n${SITE}`,
      `No fireworks in S&box this week — most items within a couple percent of last week's close.${capClause}\n${SITE}`,
      `S&box cosmetics market settled this week. Avg ${avgChange >= 0 ? "+" : ""}${avgChange.toFixed(1)}%, base building.${capClause}\n${SITE}`,
      `Consolidation week for S&box skins. ${gainerPct.toFixed(0)}% participation, mild moves.${capClause}\n${SITE}`,
      `Boring ≠ bad. S&box market flat this week, avg ${avgChange >= 0 ? "+" : ""}${avgChange.toFixed(1)}%.${capClause} Setup before the next leg?\n${SITE}`,
      `CS market watchers know consolidation often precedes expansion. S&box avg ${avgChange >= 0 ? "+" : ""}${avgChange.toFixed(1)}% this week.${capClause}\n${SITE}`,
      // hashtagged
      `S&box market quiet week — avg ${avgChange >= 0 ? "+" : ""}${avgChange.toFixed(1)}%${capClause} #sboxskins #sboxgame\n${SITE}`,
      `Stable S&box cosmetics week. Full 7d data at the #1 S&box market tracker #sboxskins\n${SITE}`,
      `#sboxgame cosmetics consolidated this week.${capClause} Charts + full data: #sboxskins\n${SITE}`,
      `Your complete S&box market tracker — quiet week, avg ${avgChange >= 0 ? "+" : ""}${avgChange.toFixed(1)}%.${capClause} #sboxmarket\n${SITE}`,
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
