import { prisma } from "@/lib/db";
import { formatPrice } from "@/lib/utils";
import {
  SITE,
  itemUrl,
  approximateLength,
  seedPick,
  type GeneratedTweet,
} from "./content";

/**
 * Additional tweet generators (added 2026-06-07).
 *
 * These lean on the data the sbox.dev enrichment unlocked — uniqueOwners,
 * topHolders, scarcityScore, soldPast24h, 6h change, leavingStoreAt,
 * category — that the original content.ts generators didn't touch.
 *
 * Same contract as the originals: each returns a GeneratedTweet, or null
 * when there's no data that fits (the cron/draft picker skips nulls).
 * Registered in content.ts's `generateTweet` switch + `generateDrafts`.
 */

type Holder = { sharePercent?: number; quantity?: number; name?: string };

/** Random element — server-side only (no React purity constraint here). */
function randPick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ===========================================================================
// Ownership & whales
// ===========================================================================

export async function genWhaleWatch(): Promise<GeneratedTweet | null> {
  const items = await prisma.item.findMany({
    where: { currentPrice: { not: null, gt: 0 }, uniqueOwners: { not: null, gt: 1 } },
    select: { name: true, slug: true, uniqueOwners: true, topHolders: true },
  });

  let best: { name: string; slug: string; share: number; owners: number } | null =
    null;
  for (const it of items) {
    const holders = Array.isArray(it.topHolders)
      ? (it.topHolders as unknown as Holder[])
      : null;
    if (!holders || holders.length === 0) continue;
    const share =
      typeof holders[0]?.sharePercent === "number" ? holders[0].sharePercent : 0;
    if (share >= 15 && (!best || share > best.share)) {
      best = { name: it.name, slug: it.slug, share, owners: it.uniqueOwners ?? 0 };
    }
  }
  if (!best) return null;

  const share = best.share.toFixed(0);
  const url = itemUrl(best.slug);
  const templates = [
    `👀 one wallet holds ${share}% of every ${best.name} out there. whale behavior.\n\n${url}`,
    `${best.name} is whale territory — the top holder controls ${share}% of the float. ${best.owners} owners total.\n${url}`,
    `concentration check: ${share}% of all ${best.name} sits in a single inventory.\n\n${url}`,
    `someone REALLY likes ${best.name}. one account = ${share}% of the supply.\n${url}`,
    `whale alert 🐋 top ${best.name} holder owns ${share}% of the market. they move the price if they sell.\n${url}`,
    `CS traders know whale wallets move markets. one holder = ${share}% of ${best.name}.\n${url}`,
    `holder concentration on ${best.name}: ${share}% in one wallet, only ${best.owners} owners. #sboxskins #sboxgame\n${url}`,
    `tightly-held alert: ${share}% of ${best.name} is in a single inventory.\n${url}`,
  ];
  const text = seedPick(templates);
  return { kind: "whale-watch", text, itemSlug: best.slug, approxLength: approximateLength(text) };
}

export async function genMostOwned(): Promise<GeneratedTweet | null> {
  const item = await prisma.item.findFirst({
    where: { uniqueOwners: { not: null, gt: 0 }, currentPrice: { not: null } },
    orderBy: { uniqueOwners: "desc" },
  });
  if (!item || !item.uniqueOwners) return null;

  const owners = item.uniqueOwners.toLocaleString();
  const price = item.currentPrice ? ` (${formatPrice(item.currentPrice)})` : "";
  const url = itemUrl(item.slug);
  const templates = [
    `most popular S&box skin by owners: ${item.name}, held by ${owners} collectors${price}.\n\n${url}`,
    `${item.name} is the people's champ — ${owners} unique owners. that's the widest spread we track.\n${url}`,
    `${owners} people own a ${item.name}${price}. democracy in cosmetic form.\n\n${url}`,
    `the most widely-held S&box cosmetic right now: ${item.name}, ${owners} owners.\n${url}`,
    `if everyone has one, it's ${item.name} — ${owners} collectors deep${price}.\n${url}`,
    `popularity contest winner: ${item.name} with ${owners} unique holders.\n${url}`,
    `${item.name}: ${owners} owners and counting. the S&box starter pack staple. #sboxskins #sboxgame\n${url}`,
    `widest ownership on the S&box market → ${item.name}, ${owners} wallets hold one.\n${url}`,
  ];
  const text = seedPick(templates);
  return { kind: "most-owned", text, itemSlug: item.slug, approxLength: approximateLength(text) };
}

export async function genTightFloat(): Promise<GeneratedTweet | null> {
  const items = await prisma.item.findMany({
    where: {
      supplyOnMarket: { not: null, gte: 1 },
      currentPrice: { not: null, gt: 0 },
      uniqueOwners: { not: null, gte: 5 },
    },
    select: {
      name: true,
      slug: true,
      currentPrice: true,
      supplyOnMarket: true,
      totalSupply: true,
      uniqueOwners: true,
    },
  });

  let best: {
    name: string;
    slug: string;
    onMarket: number;
    denom: number;
    pct: number;
    price: number;
  } | null = null;
  for (const it of items) {
    const denom =
      it.totalSupply && it.totalSupply > 0
        ? it.totalSupply
        : (it.uniqueOwners ?? 0);
    if (denom <= 0 || !it.supplyOnMarket || !it.currentPrice) continue;
    const pct = (it.supplyOnMarket / denom) * 100;
    if (pct <= 0 || pct > 100) continue;
    if (!best || pct < best.pct) {
      best = {
        name: it.name,
        slug: it.slug,
        onMarket: it.supplyOnMarket,
        denom,
        pct,
        price: it.currentPrice,
      };
    }
  }
  if (!best) return null;

  const pct = best.pct.toFixed(1);
  const price = formatPrice(best.price);
  const url = itemUrl(best.slug);
  const templates = [
    `only ${best.onMarket} ${best.name} listed for sale right now — ${pct}% of supply. tight float. ${price}.\n\n${url}`,
    `${best.name} liquidity is thin: just ${best.onMarket} on the market (${pct}% of supply). good luck filling a big order. ${price}.\n${url}`,
    `tightest float we track → ${best.name}, ${pct}% of supply actually for sale. ${price}.\n${url}`,
    `holders aren't selling ${best.name}. only ${pct}% of supply is listed (${best.onMarket} units). ${price}.\n${url}`,
    `supply squeeze watch: ${best.name} has ${best.onMarket} listed (${pct}% of the float). ${price}.\n${url}`,
    `${best.name} is locked up tight — ${pct}% on market. diamond hands energy. ${price}.\n${url}`,
    `low-liquidity alert: ${best.name}, ${best.onMarket} for sale, ${pct}% of supply. #sboxskins\n${url}`,
  ];
  const text = seedPick(templates);
  return { kind: "tight-float", text, itemSlug: best.slug, approxLength: approximateLength(text) };
}

// ===========================================================================
// Activity & momentum
// ===========================================================================

export async function genMostTraded(): Promise<GeneratedTweet | null> {
  const item = await prisma.item.findFirst({
    where: { soldPast24h: { not: null, gt: 0 }, currentPrice: { not: null } },
    orderBy: { soldPast24h: "desc" },
  });
  if (!item || !item.soldPast24h) return null;

  const sold = item.soldPast24h.toLocaleString();
  const price = item.currentPrice ? ` at ${formatPrice(item.currentPrice)}` : "";
  const url = itemUrl(item.slug);
  const templates = [
    `🔥 most traded S&box skin in 24h: ${item.name}, ${sold} sales${price}.\n\n${url}`,
    `${item.name} is changing hands fast — ${sold} sold in the last day${price}.\n${url}`,
    `today's volume leader: ${item.name} with ${sold} trades${price}.\n\n${url}`,
    `${sold} ${item.name} sold in 24h. somebody's flipping.\n${url}`,
    `liquidity king of the day → ${item.name}, ${sold} sales${price}.\n${url}`,
    `if you want a liquid S&box skin, ${item.name} did ${sold} trades today${price}.\n${url}`,
    `hottest order book on the S&box market: ${item.name}, ${sold} sold past 24h. #sboxskins #sboxgame\n${url}`,
  ];
  const text = seedPick(templates);
  return { kind: "most-traded", text, itemSlug: item.slug, approxLength: approximateLength(text) };
}

export async function genIntradayMover(): Promise<GeneratedTweet | null> {
  const items = await prisma.item.findMany({
    where: { priceChange6hPercent: { not: null }, currentPrice: { not: null, gt: 0 } },
    select: { name: true, slug: true, currentPrice: true, priceChange6hPercent: true },
  });
  let best: { name: string; slug: string; price: number; pct: number } | null = null;
  for (const it of items) {
    const pct = it.priceChange6hPercent ?? 0;
    if (Math.abs(pct) < 4) continue;
    if (!best || Math.abs(pct) > Math.abs(best.pct)) {
      best = { name: it.name, slug: it.slug, price: it.currentPrice!, pct };
    }
  }
  if (!best) return null;

  const up = best.pct >= 0;
  const pct = Math.abs(best.pct).toFixed(1);
  const sign = up ? "+" : "-";
  const price = formatPrice(best.price);
  const url = itemUrl(best.slug);
  const templates = [
    `${best.name} just moved ${sign}${pct}% in 6 hours. ${price}. fast market.\n\n${url}`,
    `intraday mover: ${best.name} ${sign}${pct}% over the last 6h to ${price}.\n${url}`,
    `${up ? "📈" : "📉"} ${best.name} ${sign}${pct}% (6h) · ${price}\n${url}`,
    `something's happening with ${best.name} — ${sign}${pct}% in 6 hours. ${price}.\n${url}`,
    `the ${best.name} chart woke up. ${sign}${pct}% intraday to ${price}.\n${url}`,
    `6-hour mover on the S&box market: ${best.name} ${sign}${pct}% · ${price}. #sboxskins\n${url}`,
    `${best.name} ${up ? "ripping" : "sliding"} this afternoon — ${sign}${pct}% in 6h. ${price}.\n${url}`,
  ];
  const text = seedPick(templates);
  return { kind: "intraday-mover", text, itemSlug: best.slug, approxLength: approximateLength(text) };
}

export async function genNewDrop(): Promise<GeneratedTweet | null> {
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const item = await prisma.item.findFirst({
    where: { createdAt: { gte: since }, currentPrice: { not: null, gt: 0 } },
    orderBy: { createdAt: "desc" },
  });
  if (!item || !item.currentPrice) return null;

  const price = formatPrice(item.currentPrice);
  const url = itemUrl(item.slug);
  const templates = [
    `fresh drop 🆕 ${item.name} just hit the S&box market at ${price}.\n\n${url}`,
    `new on the board: ${item.name} · ${price}. get familiar.\n${SITE}/new`,
    `${item.name} is the newest skin we're tracking. ${price} out the gate.\n${url}`,
    `just added: ${item.name} at ${price}. early-market pricing, do with that what you will.\n${url}`,
    `📦 new drop alert — ${item.name} · ${price}. full chart from day one: ${url}`,
    `the S&box catalog grew. newest addition: ${item.name}, ${price}.\n${SITE}/new`,
    `${item.name} just entered the market at ${price}. watch the first week. #sboxskins #sboxgame\n${url}`,
  ];
  const text = seedPick(templates);
  return { kind: "new-drop", text, itemSlug: item.slug, approxLength: approximateLength(text) };
}

export async function genMoversRoundup(): Promise<GeneratedTweet | null> {
  const gainers = await prisma.item.findMany({
    where: { priceChange24h: { gt: 0 }, currentPrice: { not: null } },
    orderBy: { priceChange24h: "desc" },
    take: 3,
  });
  if (gainers.length < 3) return null;

  const lines = gainers
    .map((g) => `• ${g.name} +${(g.priceChange24h ?? 0).toFixed(1)}%`)
    .join("\n");
  const templates = [
    `today's top S&box movers 📈\n\n${lines}\n\nfull board → ${SITE}/trends`,
    `who ate today:\n\n${lines}\n\n${SITE}/trends`,
    `24h gainers on the S&box market:\n\n${lines}\n\nlive charts → ${SITE}`,
    `daily mover roundup 🟢\n\n${lines}\n\n${SITE}/trends`,
    `green today on S&box:\n\n${lines}\n\nthe rest → ${SITE}/trends #sboxskins`,
  ];
  const text = seedPick(templates);
  return { kind: "movers-roundup", text, approxLength: approximateLength(text) };
}

// ===========================================================================
// Scarcity & value
// ===========================================================================

export async function genScarcityLeader(): Promise<GeneratedTweet | null> {
  const item = await prisma.item.findFirst({
    where: { scarcityScore: { not: null, gte: 60 }, currentPrice: { not: null } },
    orderBy: { scarcityScore: "desc" },
  });
  if (!item || item.scarcityScore == null) return null;

  const score = Math.round(item.scarcityScore);
  const price = item.currentPrice ? ` ${formatPrice(item.currentPrice)}.` : "";
  const url = itemUrl(item.slug);
  const templates = [
    `tightest market on S&box right now: ${item.name}, scarcity score ${score}/100.${price}\n\n${url}`,
    `our scarcity index leader → ${item.name} at ${score}/100. low float, held tight.${price}\n${url}`,
    `${item.name} scores ${score}/100 on scarcity — the hardest skin to accumulate right now.${price}\n${url}`,
    `scarcity spotlight: ${item.name}, ${score}/100. distribution + liquidity + momentum all say "rare".${price}\n${url}`,
    `if you want a tight S&box market, ${item.name} tops the scarcity board at ${score}/100.${price}\n${url}`,
    `#1 on our scarcity score: ${item.name} (${score}/100).${price} #sboxskins #sboxgame\n${url}`,
    `${item.name} is the hardest float to crack — scarcity ${score}/100.${price}\n${url}`,
  ];
  const text = seedPick(templates);
  return { kind: "scarcity-leader", text, itemSlug: item.slug, approxLength: approximateLength(text) };
}

export async function genMostCommon(): Promise<GeneratedTweet | null> {
  const item = await prisma.item.findFirst({
    where: { totalSupply: { not: null, gt: 0 }, currentPrice: { not: null } },
    orderBy: { totalSupply: "desc" },
  });
  if (!item || !item.totalSupply) return null;

  const supply = item.totalSupply.toLocaleString();
  const price = item.currentPrice ? ` ${formatPrice(item.currentPrice)}.` : "";
  const url = itemUrl(item.slug);
  const templates = [
    `most common S&box skin: ${item.name}, ${supply} in existence.${price}\n\n${url}`,
    `the opposite of rare → ${item.name}, ${supply} exist. everyone's got one.${price}\n${url}`,
    `${supply} ${item.name}s out there. the most abundant skin we track.${price}\n\n${url}`,
    `if rarity isn't your thing: ${item.name} has the highest supply on S&box at ${supply}.${price}\n${url}`,
    `volume play, not scarcity play — ${item.name}, ${supply} minted.${price}\n${url}`,
    `most-printed S&box cosmetic: ${item.name} (${supply}).${price} #sboxskins #sboxgame\n${url}`,
  ];
  const text = seedPick(templates);
  return { kind: "most-common", text, itemSlug: item.slug, approxLength: approximateLength(text) };
}

export async function genTopValue(): Promise<GeneratedTweet | null> {
  const items = await prisma.item.findMany({
    where: { currentPrice: { not: null, gt: 0 }, totalSupply: { not: null, gt: 0 } },
    select: { name: true, slug: true, currentPrice: true, totalSupply: true },
  });
  if (items.length === 0) return null;

  let best: { name: string; slug: string; cap: number; price: number; supply: number } | null =
    null;
  for (const it of items) {
    const cap = (it.currentPrice ?? 0) * (it.totalSupply ?? 0);
    if (!best || cap > best.cap) {
      best = {
        name: it.name,
        slug: it.slug,
        cap,
        price: it.currentPrice ?? 0,
        supply: it.totalSupply ?? 0,
      };
    }
  }
  if (!best || best.cap <= 0) return null;

  const cap = formatPrice(best.cap);
  const price = formatPrice(best.price);
  const supply = best.supply.toLocaleString();
  const url = itemUrl(best.slug);
  const templates = [
    `most valuable S&box skin by market cap: ${best.name} — ${cap} (${price} × ${supply}).\n\n${url}`,
    `${best.name} is the biggest single market on S&box: ${cap} of value across ${supply} units.\n${url}`,
    `if every ${best.name} sold at ${price}, that's ${cap}. the largest skin market we track.\n${url}`,
    `market-cap king → ${best.name}, ${cap} (price ${price} × ${supply} supply).\n${url}`,
    `the heavyweight: ${best.name} carries ${cap} in total value.\n${url}`,
    `top S&box skin by market cap: ${best.name} at ${cap}. #sboxskins #sboxmarket\n${url}`,
  ];
  const text = seedPick(templates);
  return { kind: "top-value", text, itemSlug: best.slug, approxLength: approximateLength(text) };
}

export async function genUnderADollar(): Promise<GeneratedTweet | null> {
  const items = await prisma.item.findMany({
    where: { currentPrice: { not: null, gt: 0, lt: 1 } },
    orderBy: { volume: "desc" },
    take: 5,
  });
  if (items.length < 3) return null;

  const picks = items.slice(0, 4);
  const lines = picks
    .map((i) => `• ${i.name} ${formatPrice(i.currentPrice!)}`)
    .join("\n");
  const templates = [
    `budget S&box finds under $1 💸\n\n${lines}\n\ncheap way in → ${SITE}`,
    `you can own an S&box skin for pocket change:\n\n${lines}\n\n${SITE}`,
    `under-a-dollar club:\n\n${lines}\n\nstart a collection for less than a coffee. ${SITE}`,
    `cheapest entries on the S&box market right now:\n\n${lines}\n\n${SITE}`,
    `${picks.length} S&box skins under $1:\n\n${lines}\n\n#sboxskins #sboxgame\n${SITE}`,
  ];
  const text = seedPick(templates);
  return { kind: "under-a-dollar", text, approxLength: approximateLength(text) };
}

// ===========================================================================
// Store, milestones & lists
// ===========================================================================

export async function genLeavingStore(): Promise<GeneratedTweet | null> {
  const now = Date.now();
  const soon = new Date(now + 21 * 24 * 60 * 60 * 1000);
  const item = await prisma.item.findFirst({
    where: {
      isActiveStoreItem: true,
      leavingStoreAt: { not: null, gt: new Date(now), lte: soon },
      currentPrice: { not: null },
    },
    orderBy: { leavingStoreAt: "asc" },
  });
  if (!item || !item.leavingStoreAt) return null;

  const days = Math.max(
    1,
    Math.ceil((new Date(item.leavingStoreAt).getTime() - now) / (24 * 60 * 60 * 1000)),
  );
  const dayStr = days === 1 ? "1 day" : `${days} days`;
  const price = item.currentPrice ? ` currently ${formatPrice(item.currentPrice)}.` : "";
  const url = itemUrl(item.slug);
  const templates = [
    `⏳ last call: ${item.name} leaves the S&box store in ${dayStr}. once it's gone, supply is capped.${price}\n\n${url}`,
    `${item.name} is rotating out of the store in ${dayStr}. after that it's secondary-market only.${price}\n${url}`,
    `FOMO check: ${dayStr} left to grab ${item.name} from the store before supply freezes.${price}\n${url}`,
    `clock's ticking on ${item.name} — out of the store in ${dayStr}.${price}\n${url}`,
    `🔒 supply about to cap: ${item.name} leaves the store in ${dayStr}.${price}\n${url}`,
    `${item.name} store exit in ${dayStr}. discontinued items don't get cheaper.${price} #sboxskins\n${url}`,
  ];
  const text = seedPick(templates);
  return { kind: "leaving-store", text, itemSlug: item.slug, approxLength: approximateLength(text) };
}

/** All-time-high alert — implements the long-reserved "new-high" kind. */
export async function genNewHigh(): Promise<GeneratedTweet | null> {
  const items = await prisma.item.findMany({
    where: { currentPrice: { not: null, gt: 0 } },
    select: { id: true, name: true, slug: true, currentPrice: true },
  });
  if (items.length === 0) return null;

  const stats = await prisma.pricePoint.groupBy({
    by: ["itemId"],
    _max: { price: true },
    _count: { price: true },
  });
  const maxMap = new Map<string, number>();
  for (const s of stats) {
    // Require some history so a 2-point brand-new item doesn't trivially "ATH".
    if ((s._count.price ?? 0) >= 5 && s._max.price != null) {
      maxMap.set(s.itemId, s._max.price);
    }
  }

  const atHigh = items
    .filter((it) => {
      const max = maxMap.get(it.id);
      return max != null && max > 0 && (it.currentPrice ?? 0) >= max * 0.999;
    })
    .sort((a, b) => (b.currentPrice ?? 0) - (a.currentPrice ?? 0));
  const item = atHigh[0];
  if (!item || !item.currentPrice) return null;

  const price = formatPrice(item.currentPrice);
  const url = itemUrl(item.slug);
  const templates = [
    `🚀 ${item.name} just printed a new all-time high: ${price}. nothing but green candles.\n\n${url}`,
    `ATH alert — ${item.name} at ${price}, a level it's never closed above.\n${url}`,
    `${item.name} is in price discovery. fresh all-time high at ${price}.\n${url}`,
    `new record for ${item.name}: ${price}. holders never seen these numbers.\n${url}`,
    `${item.name} broke out to a new high — ${price}. no overhead resistance left.\n${url}`,
    `📈 all-time high: ${item.name} · ${price}. #sboxskins #sboxgame\n${url}`,
  ];
  const text = seedPick(templates);
  return { kind: "new-high", text, itemSlug: item.slug, approxLength: approximateLength(text) };
}

export async function genOnThisDay(): Promise<GeneratedTweet | null> {
  const withDates = await prisma.item.findMany({
    where: { releaseDate: { not: null } },
    select: {
      name: true,
      slug: true,
      currentPrice: true,
      releaseDate: true,
      releasePrice: true,
    },
  });
  const now = new Date();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  const matches = withDates.filter((it) => {
    if (!it.releaseDate) return false;
    const rd = new Date(it.releaseDate);
    return (
      rd.getUTCMonth() === m &&
      rd.getUTCDate() === d &&
      rd.getUTCFullYear() < now.getUTCFullYear()
    );
  });
  if (matches.length === 0) return null;

  const item = randPick(matches);
  const year = new Date(item.releaseDate!).getUTCFullYear();
  const url = itemUrl(item.slug);
  const now$ = item.currentPrice ? formatPrice(item.currentPrice) : null;
  const then$ = item.releasePrice ? formatPrice(item.releasePrice) : null;

  const journey =
    then$ && now$
      ? ` launched at ${then$}, now ${now$}.`
      : now$
        ? ` now trading at ${now$}.`
        : ".";
  const templates = [
    `on this day in ${year}, ${item.name} dropped on S&box.${journey}\n\n${url}`,
    `${item.name} turns another year old today — released ${year}.${journey}\n${url}`,
    `S&box throwback 📅 ${item.name} launched on this date in ${year}.${journey}\n${url}`,
    `happy release-day to ${item.name} (${year}).${journey}\n${url}`,
    `time flies — ${item.name} hit the S&box store on this day, ${year}.${journey} #sboxskins\n${url}`,
  ];
  const text = seedPick(templates);
  return { kind: "on-this-day", text, itemSlug: item.slug, approxLength: approximateLength(text) };
}

export async function genHeadToHead(): Promise<GeneratedTweet | null> {
  const pool = await prisma.item.findMany({
    where: { currentPrice: { not: null, gt: 0 } },
    orderBy: { volume: "desc" },
    take: 16,
  });
  if (pool.length < 2) return null;

  const a = randPick(pool);
  let b = randPick(pool);
  let guard = 0;
  while (b.slug === a.slug && guard++ < 10) b = randPick(pool);
  if (b.slug === a.slug) return null;

  const pa = formatPrice(a.currentPrice!);
  const pb = formatPrice(b.currentPrice!);
  const ua = itemUrl(a.slug);
  const ub = itemUrl(b.slug);
  const templates = [
    `head to head ⚔️\n\n${a.name} — ${pa}\n${b.name} — ${pb}\n\nwhich ages better? charts: ${ua}`,
    `${a.name} (${pa}) vs ${b.name} (${pb}). pick one to hold for a year. go.\n\n${ua}`,
    `S&box matchup: ${a.name} at ${pa} or ${b.name} at ${pb}? settle it.\n${ua}`,
    `you can only keep one:\n${a.name} ${pa}\n${b.name} ${pb}\n\n${ua}`,
    `${a.name} ${pa} 🆚 ${b.name} ${pb} — better long-term bag? compare the charts.\n${ub}`,
    `trader's dilemma: ${a.name} (${pa}) or ${b.name} (${pb})? #sboxskins #sboxgame\n${ua}`,
  ];
  const text = seedPick(templates);
  return { kind: "head-to-head", text, itemSlug: a.slug, approxLength: approximateLength(text) };
}

export async function genTopFive(): Promise<GeneratedTweet | null> {
  const items = await prisma.item.findMany({
    where: { currentPrice: { not: null, gt: 0 } },
    orderBy: { currentPrice: "desc" },
    take: 5,
  });
  if (items.length < 5) return null;

  const lines = items
    .map((i, idx) => `${idx + 1}. ${i.name} — ${formatPrice(i.currentPrice!)}`)
    .join("\n");
  const templates = [
    `💰 top 5 priciest S&box skins right now:\n\n${lines}\n\nfull rankings → ${SITE}`,
    `the most expensive S&box cosmetics today:\n\n${lines}\n\n${SITE}`,
    `S&box rich list 🏆\n\n${lines}\n\nlive prices → ${SITE}`,
    `priciest skins on the S&box market:\n\n${lines}\n\n${SITE}`,
    `top 5 by price 📊\n\n${lines}\n\n#sboxskins #sboxgame\n${SITE}`,
  ];
  const text = seedPick(templates);
  return { kind: "top-five", text, approxLength: approximateLength(text) };
}

export async function genCategoryKing(): Promise<GeneratedTweet | null> {
  const items = await prisma.item.findMany({
    where: { category: { not: null }, currentPrice: { not: null, gt: 0 } },
    select: { name: true, slug: true, currentPrice: true, category: true },
  });
  if (items.length === 0) return null;

  // Group by category, keep only categories with >= 2 items, pick a random one.
  const byCat = new Map<string, typeof items>();
  for (const it of items) {
    const cat = it.category!;
    const arr = byCat.get(cat) ?? [];
    arr.push(it);
    byCat.set(cat, arr);
  }
  const eligible = [...byCat.entries()].filter(([, arr]) => arr.length >= 2);
  if (eligible.length === 0) return null;

  const [category, arr] = randPick(eligible);
  const king = arr.reduce((top, it) =>
    (it.currentPrice ?? 0) > (top.currentPrice ?? 0) ? it : top,
  );
  const price = formatPrice(king.currentPrice!);
  const cat = category.toLowerCase();
  const url = itemUrl(king.slug);
  const templates = [
    `priciest ${cat} on S&box: ${king.name} at ${price}.\n\n${url}`,
    `${cat} category king 👑 ${king.name} — ${price}.\n${url}`,
    `if you want the top-shelf ${cat}, it's ${king.name} at ${price}.\n${url}`,
    `most expensive ${cat} we track: ${king.name}, ${price}.\n${url}`,
    `${cat} leaderboard #1 → ${king.name} (${price}).\n${url}`,
    `the ${cat} to beat: ${king.name} at ${price}. #sboxskins #sboxgame\n${url}`,
  ];
  const text = seedPick(templates);
  return { kind: "category-king", text, itemSlug: king.slug, approxLength: approximateLength(text) };
}
