import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import {
  fetchAllMarketItems,
  getPriceOverview,
  getSteamImageUrl,
  getMarketUrl,
  parseSteamPrice,
  searchMarketByQuery,
} from "@/lib/steam/client";
import type { SteamSearchResult, SyncResult } from "@/lib/steam/types";

/**
 * Items we know exist on the Steam Market but have been missing from
 * sync results historically. Steam's paginated /market/search/render is
 * occasionally lossy — items can drop between pages during a sync and
 * never make it into our DB. The reconciliation pass below re-seeds
 * these by exact-name query if the main paginated sync didn't return
 * them, so gaps self-heal.
 *
 * Add more names here when you spot another missing item. Keep in sync
 * with real Steam market_hash_name values (case-sensitive on Steam's
 * side but we match case-insensitive).
 */
const KNOWN_MARKET_HASH_NAMES: readonly string[] = [
  "Hard Hat",
];

/** Safety cap — don't run unbounded individual Steam queries if the
 * main sync missed a huge number of items (probably a Steam outage,
 * reconciling hundreds of names one at a time would be worse). */
const MAX_RECONCILE_ATTEMPTS = 15;
import { slugify, median } from "@/lib/utils";
import { debug } from "@/lib/debug";

/**
 * Infer the item type from the item name and Steam's type string.
 * S&box items have Steam types like "Hat", "Shirt", "Pants", etc — but many
 * items don't have useful Steam types, so we also scan the item name.
 *
 * Order matters: we check most-specific keywords first.
 */
export function inferItemType(steamType: string, itemName = ""): string {
  // Combine both strings — many clues are in the name (e.g. "SWAG Chain", "Pirate Hook")
  const text = `${steamType} ${itemName}`.toLowerCase();

  // Accessories: jewelry, small wearables, face items
  const accessoryKeywords = [
    "hat", "cap", "beanie", "crown", "hood", "hair",
    "helmet", "mask", "head", "face", "goggles", "glasses",
    "earring", "ear rings", "necklace", "chain", "pendant",
    "ring", "bracelet", "watch", "jewelry", "nose", "beard",
    "tattoo", "glove", "mitten", "bandana", "scarf",
    "backpack", "bag", "handbag", "purse", "satchel",
    "pipe", "cigar", "cigarette",
  ];

  // Weapons / tools held in hand
  const weaponKeywords = [
    "weapon", "knife", "sword", "blade", "gun", "pistol",
    "rifle", "dagger", "axe", "hammer", "bat", "club",
    "bow", "crossbow", "spear", "staff", "wand",
  ];

  // Tools — non-weapon utility items
  const toolKeywords = [
    "hook", "wrench", "screwdriver", "saw", "drill",
    "flashlight", "lantern", "torch", "shovel", "pickaxe",
  ];

  // Clothing — outfits and body-worn items
  const clothingKeywords = [
    "shirt", "jacket", "hoodie", "coat", "raincoat", "jumper",
    "sweater", "top", "dress", "gown", "robe", "blouse",
    "pants", "trouser", "shorts", "bottom", "skirt", "jean",
    "boot", "shoe", "footwear", "sneaker", "sandal", "slipper",
    "slippers", "heels",
    "boxers", "bra", "underwear", "lingerie", "bodice",
    "waistcoat", "vest", "cape", "cloak", "apron", "uniform",
    "jumpsuit", "tracksuit", "overalls", "lifejacket",
  ];

  // Character: full avatars, outfits, complete skins
  const characterKeywords = [
    "skin", "character", "outfit", "suit", "costume",
    "avatar", "model", "player model",
  ];

  // Check in specificity order — most specific first so e.g. "Scuba Mask"
  // matches accessory before a generic "skin" match.
  if (accessoryKeywords.some((k) => text.includes(k))) return "accessory";
  if (weaponKeywords.some((k) => text.includes(k))) return "weapon";
  if (toolKeywords.some((k) => text.includes(k))) return "tool";
  if (clothingKeywords.some((k) => text.includes(k))) return "clothing";
  if (characterKeywords.some((k) => text.includes(k))) return "character";

  // Fallback: Steam types that specifically said "tool"
  if (text.includes("tool")) return "tool";

  // Default to clothing for unknown items (most S&box cosmetics are clothing)
  return "clothing";
}

/**
 * Sync all items from the Steam Community Market.
 * Fetches the item list, then optionally fetches price details for each.
 * NEVER falls back to mock data — only real Steam data.
 */
export async function syncItems(fetchPrices = false): Promise<SyncResult> {
  const startTime = Date.now();
  const result: SyncResult = {
    success: false,
    itemsProcessed: 0,
    itemsCreated: 0,
    itemsUpdated: 0,
    pricePointsCreated: 0,
    errors: [],
    duration: 0,
  };

  try {
    debug("[sync] Fetching items from Steam Market (appid 590830)...");
    const steamItems = await fetchAllMarketItems();

    if (steamItems.length === 0) {
      result.errors.push("No items returned from Steam Market API — Steam may be rate-limiting or down");
      result.duration = Date.now() - startTime;
      return result;
    }

    debug(`[sync] Found ${steamItems.length} items on Steam Market`);

    // Log each item name for debugging
    for (const item of steamItems) {
      debug(`[sync]   - "${item.name}" (hash: ${item.hash_name}, price: $${(item.sell_price / 100).toFixed(2)}, listings: ${item.sell_listings})`);
    }

    // Batched lookup of each item's price ~24h ago.
    // 4-hour window CENTERED on exactly 24h ago — [now-26h, now-22h] —
    // so the median of the window's points approximates "price 24 hours
    // ago" rather than "price 26 hours ago" (which is what [now-28h,
    // now-24h] gave us before). Alignment matters because the chart's
    // own 24h view starts at now-24h, so if our baseline is 2h earlier
    // than that, the header % and chart % disagree for items that moved
    // in those extra 2 hours.
    //
    // Why median across the window: Steam's /market/search occasionally
    // returns spurious sell_price values during a sync. If the baseline
    // picked one of those, priceChange24h blew up (we saw +80% when the
    // real move was sideways). Median across 4-8 typical window points
    // is immune to single-point outliers and still tracks real moves.
    const windowEnd = new Date(Date.now() - 22 * 60 * 60 * 1000);
    const windowStart = new Date(Date.now() - 26 * 60 * 60 * 1000);
    const pointsFrom24hAgo = await prisma.pricePoint.findMany({
      where: { timestamp: { gte: windowStart, lte: windowEnd } },
      select: { itemId: true, price: true },
    });
    const pointsByItem = new Map<string, number[]>();
    for (const p of pointsFrom24hAgo) {
      const arr = pointsByItem.get(p.itemId) ?? [];
      arr.push(p.price);
      pointsByItem.set(p.itemId, arr);
    }
    const priceAt24hAgo = new Map<string, number>();
    for (const [itemId, prices] of pointsByItem) {
      const m = median(prices);
      if (m !== null && m > 0) priceAt24hAgo.set(itemId, m);
    }
    debug(
      `[sync] Loaded 24h-ago baselines for ${priceAt24hAgo.size} items (median across the 4h window centered on 24h ago, from ${pointsFrom24hAgo.length} points total)`,
    );

    // Accumulate price points to write in one batch at the end (avoids N+1)
    const pendingPricePoints: { itemId: string; price: number; volume: number }[] = [];

    for (const steamItem of steamItems) {
      try {
        const itemId = await upsertItem(steamItem, result, priceAt24hAgo);
        if (itemId) {
          pendingPricePoints.push({
            itemId,
            price: steamItem.sell_price / 100,
            volume: steamItem.sell_listings,
          });
        }
        result.itemsProcessed++;
      } catch (error) {
        const msg = `Failed to process item "${steamItem.name}": ${error}`;
        console.error(`[sync] ${msg}`);
        result.errors.push(msg);
      }
    }

    // Flush price points in one batch — single DB roundtrip instead of N
    if (pendingPricePoints.length > 0) {
      await prisma.pricePoint.createMany({ data: pendingPricePoints });
      result.pricePointsCreated = pendingPricePoints.length;
    }

    // --- Reconciliation pass ---
    // Steam's paginated search is occasionally lossy; items can drop
    // between pages and never make it into our sync. We track the set
    // of hash_names this run actually returned, then compare against
    // (a) items previously seen in our DB and (b) a curated known-list
    // of items we've spotted as chronically missing. Anything in either
    // group that wasn't in this run gets re-seeded via a direct query
    // to Steam, so gaps self-heal without manual curl-ing.
    const seenThisSync = new Set(steamItems.map((i) => i.hash_name));
    const knownFromDB = await prisma.item.findMany({
      where: { steamMarketId: { not: null } },
      select: { steamMarketId: true },
    });
    const expected = new Set<string>([
      ...knownFromDB
        .map((i) => i.steamMarketId)
        .filter((x): x is string => !!x),
      ...KNOWN_MARKET_HASH_NAMES,
    ]);
    const missing = [...expected].filter((n) => !seenThisSync.has(n));

    if (missing.length > 0) {
      // Cap to avoid runaway — if Steam dropped dozens at once, more
      // likely an outage than a real gap. Next sync will try again.
      const toReconcile = missing.slice(0, MAX_RECONCILE_ATTEMPTS);
      if (missing.length > MAX_RECONCILE_ATTEMPTS) {
        debug(
          `[sync:reconcile] ${missing.length} items missing — attempting first ${MAX_RECONCILE_ATTEMPTS} only`,
        );
      } else {
        debug(`[sync:reconcile] ${missing.length} items missing — attempting to reseed`);
      }
      let reconciled = 0;
      for (const hashName of toReconcile) {
        try {
          const res = await seedItemByHashName(hashName, result);
          if (res.itemId) {
            reconciled++;
            debug(`[sync:reconcile]   ✓ reseeded "${res.matchedName ?? hashName}"`);
          }
        } catch (err) {
          result.errors.push(`Reconcile "${hashName}": ${err}`);
        }
      }
      if (reconciled > 0) {
        debug(`[sync:reconcile] Reseeded ${reconciled}/${toReconcile.length} missing items`);
      }
    }

    // Optionally fetch detailed price overview for each item
    if (fetchPrices) {
      debug("[sync] Fetching detailed price overviews...");
      const items = await prisma.item.findMany({
        where: { steamMarketId: { not: null } },
        select: { id: true, name: true, steamMarketId: true },
      });

      for (const item of items) {
        try {
          await syncItemPrice(item.id, item.steamMarketId!);
          result.pricePointsCreated++;
        } catch (error) {
          result.errors.push(`Price fetch failed for "${item.name}": ${error}`);
        }
      }
    }

    result.success = true;
  } catch (error) {
    result.errors.push(`Sync failed: ${error}`);
  }

  result.duration = Date.now() - startTime;
  debug(
    `[sync] Complete: ${result.itemsProcessed} processed, ${result.itemsCreated} created, ${result.itemsUpdated} updated, ${result.pricePointsCreated} price points in ${result.duration}ms`
  );
  return result;
}

/**
 * Generate an item description that sounds human and hits SEO keywords without
 * being a templated robo-blurb. Uses price tier and limited flag to vary the
 * wording, and weaves Steam's own type label in naturally when it differs from
 * our inferred category.
 *
 * Keywords that still appear somewhere: S&box, Steam Community Market,
 * Facepunch Studios, skin + type, live price, order book, total supply.
 */
function generateDescription(
  name: string,
  type: string,
  steamType: string,
  priceInDollars: number,
  isLimited = false,
): string {
  // Natural type framing — varies so every item doesn't start "X is a clothing item"
  const typePhrase: Record<string, string> = {
    character: "a full-body S&box character skin",
    clothing: "an S&box clothing piece",
    accessory: "an S&box accessory",
    weapon: "an S&box weapon skin",
    tool: "an S&box tool skin",
  };
  const typeText = typePhrase[type] ?? "an S&box cosmetic";

  // Steam's raw type (e.g. "Outfit", "Workshop Item") woven in parenthetically,
  // only when it adds info beyond our category guess.
  const cleaned = (steamType ?? "").trim();
  const steamNote =
    cleaned && !typeText.toLowerCase().includes(cleaned.toLowerCase())
      ? ` (Steam lists it as ${/^[aeiou]/i.test(cleaned) ? "an" : "a"} ${cleaned})`
      : "";

  // Price context as a natural clause, not a robotic "premium-tier" label
  const priceClause =
    priceInDollars >= 100
      ? "sitting near the top of the S&box market pricing-wise"
      : priceInDollars >= 20
      ? "in the higher price bracket for S&box skins"
      : priceInDollars >= 5
      ? "comfortably mid-range"
      : priceInDollars >= 1
      ? "an easy pickup price-wise"
      : "one of the cheaper S&box skins around";

  const limitedNote = isLimited
    ? " It's flagged as limited edition, so no new ones get minted — supply is fixed."
    : "";

  // Vary the Facepunch mention slightly to avoid identical middle sentences
  const facepunchBlurb =
    type === "character"
      ? "S&box is the sandbox game from Facepunch Studios, the folks behind Garry's Mod and Rust."
      : "Made for S&box, the Facepunch Studios sandbox game (the team behind Garry's Mod and Rust).";

  return (
    `${name} — ${typeText}${steamNote}, ${priceClause} and trading on the Steam Community Market.${limitedNote} ` +
    `${facepunchBlurb} ` +
    `Live price, 24h change, full buy/sell order book, total supply, and the price chart for ${name} are all below — synced from Steam every 15–30 minutes.`
  );
}

/**
 * Upsert a single item from Steam search results into the database.
 * Uses steamMarketId (hash_name) as the unique key.
 *
 * Returns the item ID so callers can batch price-point writes afterward.
 * Single findUnique + single create/update = 2 DB roundtrips per item
 * (previously 3 + an extra create call for price points).
 *
 * @param priceAt24hAgo Map of itemId -> price ~24 hours ago, used for
 * accurate priceChange24h calculation. If undefined or an item is missing,
 * falls back to comparing against the previous sync (not ideal but better
 * than nothing when we have < 24h of history).
 */
export async function upsertItem(
  steamItem: SteamSearchResult,
  result: SyncResult,
  priceAt24hAgo?: Map<string, number>,
): Promise<string | null> {
  const hashName = steamItem.hash_name;
  const slug = slugify(hashName);
  const priceInDollars = steamItem.sell_price / 100; // sell_price is in cents
  const itemType = inferItemType(steamItem.asset_description?.type || "", steamItem.name);
  const iconUrl = steamItem.asset_description?.icon_url
    ? getSteamImageUrl(steamItem.asset_description.icon_url)
    : null;

  // Single query for everything we need about the existing row
  const existing = await prisma.item.findUnique({
    where: { steamMarketId: hashName },
    select: {
      id: true,
      name: true,
      isLimited: true,
      currentPrice: true,
      description: true,
      imageUrl: true,
    },
  });

  const generatedDescription = generateDescription(
    steamItem.name,
    itemType,
    steamItem.asset_description?.type || "",
    priceInDollars,
    existing?.isLimited ?? false,
  );

  const data = {
    name: steamItem.name,
    slug,
    steamMarketId: hashName,
    type: itemType,
    description: generatedDescription,
    imageUrl: iconUrl,
    marketUrl: getMarketUrl(hashName),
    currentPrice: priceInDollars,
    volume: steamItem.sell_listings,
  };

  if (existing) {
    // Prefer the actual 24h-ago price when we have it. Only fall back to the
    // previous sync's price (which is typically ~15-30 min old) if we don't.
    const baseline24h = priceAt24hAgo?.get(existing.id);
    const baselinePrice =
      baseline24h !== undefined && baseline24h > 0
        ? baseline24h
        : existing.currentPrice && existing.currentPrice > 0
          ? existing.currentPrice
          : null;
    const priceChange =
      baselinePrice !== null
        ? ((priceInDollars - baselinePrice) / baselinePrice) * 100
        : 0;

    // Detect auto-generated descriptions so we can refresh them when the
    // generator changes. Hand-edited descriptions are preserved.
    const isGeneratedDescription =
      !existing.description ||
      existing.description.startsWith(`${existing.name} is a`) ||
      existing.description.startsWith(`${existing.name} — `);

    await prisma.item.update({
      where: { id: existing.id },
      data: {
        ...data,
        priceChange24h: Math.round(priceChange * 100) / 100,
        description: isGeneratedDescription ? generatedDescription : existing.description,
        imageUrl: iconUrl || existing.imageUrl, // prefer fresh Steam image
      },
    });
    result.itemsUpdated++;
    return existing.id;
  } else {
    // create returns the new row — no need for a second findUnique to get ID
    const created = await prisma.item.create({
      data,
      select: { id: true },
    });
    result.itemsCreated++;
    return created.id;
  }
}

/**
 * Seed a single item by its market_hash_name via the Steam search
 * endpoint (the /market/search/render API filtered by query). Used both
 * by the /api/admin/seed-item escape-hatch AND by the reconciliation
 * pass in syncItems() when the main paginated sync missed an item we
 * know about.
 *
 * Runs through the same upsertItem path as the regular sync, so seeded
 * items are indistinguishable from normally-synced ones (same slug,
 * type inference, description).
 *
 * Returns null if Steam's response had no exact match for the name.
 */
export async function seedItemByHashName(
  hashName: string,
  result: SyncResult,
): Promise<{ itemId: string | null; matchedName: string | null; slug: string | null }> {
  const search = await searchMarketByQuery(hashName, 20);
  if (!search || !search.success) {
    return { itemId: null, matchedName: null, slug: null };
  }

  const match = search.results.find(
    (r) => r.hash_name.toLowerCase() === hashName.toLowerCase(),
  );
  if (!match) {
    return { itemId: null, matchedName: null, slug: null };
  }

  const itemId = await upsertItem(match, result);
  return { itemId, matchedName: match.name, slug: itemId ? slugify(match.hash_name) : null };
}

/**
 * Seed a single item directly from sbox.dev when Steam Market doesn't
 * have it (e.g. brand-new drops, non-marketable items, or items with a
 * different name on Steam vs sbox.dev). Creates a row with no
 * `steamMarketId` — Steam-side enrichment fills in later if/when the
 * item lands on the Market.
 *
 * Pass either the bare slug ("hard-hat") or a sbox.dev URL
 * ("https://sbox.dev/skins/hard-hat") — we strip the prefix.
 *
 * Returns null if sbox.dev has no record under that slug.
 */
export async function seedItemFromSboxDev(
  slugOrUrl: string,
  result: SyncResult,
): Promise<{ itemId: string | null; matchedName: string | null; slug: string | null }> {
  // Accept full URL or bare slug.
  const slug = slugOrUrl
    .trim()
    .replace(/^https?:\/\/(www\.)?sbox\.dev\/skins\//, "")
    .replace(/^\//, "")
    .split(/[?#]/)[0];

  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    return { itemId: null, matchedName: null, slug: null };
  }

  const skin = await fetchSboxSkin(slug);
  if (!skin) {
    return { itemId: null, matchedName: null, slug: null };
  }

  // Use sbox.dev's slug verbatim — that way the next sbox.dev sync
  // round can find this row by slug without ambiguity.
  const itemType = inferItemType(
    skin.itemType ?? "",
    skin.name,
  );

  const existing = await prisma.item.findUnique({
    where: { slug },
    select: { id: true },
  });

  // Description style mirrors the auto-generated text the regular Steam
  // sync emits. Deliberately doesn't reference any third-party tracker
  // — readers don't need to know our enrichment source, and namedropping
  // a competitor in our own item descriptions would be silly.
  const description = `${skin.name} is a${
    /^[aeiou]/i.test(itemType) ? "n" : ""
  } S&box ${itemType}${
    skin.itemDisplayName ? ` (${skin.itemDisplayName})` : ""
  }${
    skin.category ? ` in the ${skin.category} category` : ""
  }. ${
    skin.totalSupply
      ? `Total supply: ${skin.totalSupply.toLocaleString()}. `
      : ""
  }Track price history, supply, and ownership over time.`;

  // Image discovery cascade: API response → page-scrape fallback. The
  // sbox.dev API doesn't reliably expose the icon URL in the per-skin
  // payload, but their /skins/<slug> page renders it in og:image metadata
  // pointing at cdn.sbox.game/asset/<hash>.png. Scraping per-item is
  // cheap (one extra fetch on first seed, never repeated since we store
  // the resolved URL).
  let imageUrl: string | null = pickSboxImage(skin);
  if (!imageUrl) {
    imageUrl = await fetchSboxSkinImage(slug);
  }

  const data = {
    name: skin.name,
    slug,
    // Leave steamMarketId null — non-marketable items don't have one,
    // and the reconciliation pass in syncItems() will fill it in if
    // and when the item gets a Market listing.
    type: itemType,
    description,
    imageUrl,
    currentPrice: skin.price > 0 ? skin.price : null,
    storePrice: skin.releasePrice ?? null,
    releasePrice: skin.releasePrice ?? null,
    releaseDate: skin.release ? new Date(skin.release) : null,
    isActiveStoreItem: skin.isActiveStoreItem,
    isPermanentStoreItem: skin.isPermanentStoreItem,
    leavingStoreAt: skin.leavingStoreAt ? new Date(skin.leavingStoreAt) : null,
    totalSupply: skin.totalSupply,
    uniqueOwners: skin.uniqueOwners,
    soldPast24h: skin.soldPast24H ?? skin.boughtInTheLast24H,
    supplyOnMarket: skin.supplyOnMarket,
    totalSales: skin.sales,
    itemDisplayName: skin.itemDisplayName,
    category: skin.category,
    itemSubType: skin.itemType,
    workshopId: skin.workshopId,
    iconBackgroundColor: skin.iconBackgroundColor,
    sboxSyncedAt: new Date(),
  };

  if (existing) {
    await prisma.item.update({ where: { id: existing.id }, data });
    result.itemsUpdated++;
    return { itemId: existing.id, matchedName: skin.name, slug };
  }

  const created = await prisma.item.create({
    data,
    select: { id: true },
  });
  result.itemsCreated++;
  return { itemId: created.id, matchedName: skin.name, slug };
}

/**
 * Fetch and record detailed price for a single item using priceoverview.
 */
async function syncItemPrice(
  itemId: string,
  marketHashName: string
): Promise<void> {
  const overview = await getPriceOverview(marketHashName);
  if (!overview || !overview.success) return;

  const lowestPrice = parseSteamPrice(overview.lowest_price);
  const medianPrice = parseSteamPrice(overview.median_price);
  const volume = overview.volume ? parseInt(overview.volume, 10) : null;

  const updateData: Record<string, unknown> = {};
  if (lowestPrice !== null) updateData.lowestPrice = lowestPrice;
  if (medianPrice !== null) updateData.medianPrice = medianPrice;
  if (volume !== null) updateData.volume = volume;

  if (Object.keys(updateData).length > 0) {
    await prisma.item.update({
      where: { id: itemId },
      data: updateData,
    });
  }

  // Record price point from median price
  const price = medianPrice ?? lowestPrice;
  if (price !== null) {
    await prisma.pricePoint.create({
      data: {
        itemId,
        price,
        volume: volume ?? 0,
      },
    });
  }
}

/**
 * Sync prices for a batch of items (useful for cron with time limits).
 * Processes up to `batchSize` items that haven't been updated recently.
 * Only processes items with a valid steamMarketId.
 */
export async function syncPriceBatch(batchSize = 30): Promise<SyncResult> {
  const startTime = Date.now();
  const result: SyncResult = {
    success: false,
    itemsProcessed: 0,
    itemsCreated: 0,
    itemsUpdated: 0,
    pricePointsCreated: 0,
    errors: [],
    duration: 0,
  };

  try {
    const items = await prisma.item.findMany({
      where: { steamMarketId: { not: null } },
      select: { id: true, name: true, steamMarketId: true },
      orderBy: { updatedAt: "asc" },
      take: batchSize,
    });

    debug(`[sync:prices] Processing ${items.length} items...`);

    for (const item of items) {
      try {
        await syncItemPrice(item.id, item.steamMarketId!);
        result.itemsProcessed++;
        result.pricePointsCreated++;
      } catch (error) {
        result.errors.push(`Price sync failed for "${item.name}": ${error}`);
      }
    }

    result.success = true;
  } catch (error) {
    result.errors.push(`Batch sync failed: ${error}`);
  }

  result.duration = Date.now() - startTime;
  debug(`[sync:prices] Complete: ${result.itemsProcessed} items in ${result.duration}ms`);
  return result;
}

/**
 * Remove items from the database that don't have a valid steamMarketId.
 * These are mock/fake items that were created from demo data.
 * Also removes their associated price points and alerts.
 */
export async function cleanupNonSteamItems(): Promise<SyncResult> {
  const startTime = Date.now();
  const result: SyncResult = {
    success: false,
    itemsProcessed: 0,
    itemsCreated: 0,
    itemsUpdated: 0,
    pricePointsCreated: 0,
    errors: [],
    duration: 0,
  };

  try {
    // Find items without a steamMarketId (these are mock data)
    const fakeItems = await prisma.item.findMany({
      where: { steamMarketId: null },
      select: { id: true, name: true, slug: true },
    });

    if (fakeItems.length === 0) {
      debug("[cleanup] No non-Steam items found — database is clean");
      result.success = true;
      result.duration = Date.now() - startTime;
      return result;
    }

    debug(`[cleanup] Found ${fakeItems.length} non-Steam items to remove:`);
    for (const item of fakeItems) {
      debug(`[cleanup]   - "${item.name}" (slug: ${item.slug})`);
    }

    const fakeIds = fakeItems.map((i) => i.id);

    // Delete associated price points first (cascade should handle this, but be explicit)
    const deletedPoints = await prisma.pricePoint.deleteMany({
      where: { itemId: { in: fakeIds } },
    });
    debug(`[cleanup] Deleted ${deletedPoints.count} fake price points`);

    // Delete associated price alerts
    const deletedAlerts = await prisma.priceAlert.deleteMany({
      where: { itemId: { in: fakeIds } },
    });
    debug(`[cleanup] Deleted ${deletedAlerts.count} fake price alerts`);

    // Delete the fake items
    const deleted = await prisma.item.deleteMany({
      where: { id: { in: fakeIds } },
    });
    debug(`[cleanup] Deleted ${deleted.count} non-Steam items`);

    result.itemsProcessed = deleted.count;
    result.success = true;
  } catch (error) {
    result.errors.push(`Cleanup failed: ${error}`);
  }

  result.duration = Date.now() - startTime;
  return result;
}

/**
 * Capture a snapshot of current market-wide metrics.
 * Called after each successful sync to build historical trend data.
 */
export async function captureMarketSnapshot(): Promise<void> {
  const items = await prisma.item.findMany({
    select: { currentPrice: true, volume: true, totalSupply: true },
  });

  if (items.length === 0) return;

  const prices = items.map((i) => i.currentPrice ?? 0).filter((p) => p > 0);
  const sortedPrices = [...prices].sort((a, b) => a - b);

  const listingsValue = items.reduce(
    (sum, i) => sum + (i.currentPrice ?? 0) * (i.volume ?? 0),
    0,
  );
  // Estimated true market cap — only items with known supply
  const itemsWithSupply = items.filter(
    (i) => i.totalSupply != null && i.totalSupply > 0 && (i.currentPrice ?? 0) > 0,
  );
  const estMarketCap = itemsWithSupply.length > 0
    ? itemsWithSupply.reduce(
        (sum, i) => sum + (i.currentPrice ?? 0) * (i.totalSupply ?? 0),
        0,
      )
    : null;

  await prisma.marketSnapshot.create({
    data: {
      totalItems: items.length,
      listingsValue,
      estMarketCap,
      avgPrice: prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : 0,
      medianPrice: median(prices),
      totalVolume: items.reduce((sum, i) => sum + (i.volume ?? 0), 0),
      totalSupply: items.reduce((sum, i) => sum + (i.totalSupply ?? 0), 0) || null,
      floor: sortedPrices.length > 0 ? sortedPrices[0] : null,
      ceiling: sortedPrices.length > 0 ? sortedPrices[sortedPrices.length - 1] : null,
    },
  });

  debug(
    `[sync] Market snapshot: ${items.length} items, listings value $${listingsValue.toFixed(2)}, est market cap ${estMarketCap ? `$${estMarketCap.toFixed(2)}` : "n/a"}`,
  );
}

// ---------------------------------------------------------------------------
// sbox.dev API enrichment
// ---------------------------------------------------------------------------

interface SboxSkinData {
  totalSupply: number;
  priceChange24h: number;
  priceChange24hPercent: number;
  priceChange6h: number;
  priceChange6hPercent: number;
  uniqueOwners: number;
  name: string;
  slug: string;
  tradable: boolean;
  marketable: boolean;
  price: number;
  releasePrice: number | null;
  release: string | null;
  isActiveStoreItem: boolean;
  isPermanentStoreItem: boolean;
  leavingStoreAt: string | null;
  boughtInTheLast24H: number;
  soldPast24H: number;
  supplyOnMarket: number;
  sales: number;
  itemDisplayName: string | null;
  category: string | null;
  itemType: string | null;
  workshopId: string | null;
  iconBackgroundColor: string | null;
  // Image fields — sbox.dev's exact key here has churned over versions
  // and we can't pin it down without poking the live API. Probe all
  // plausible names; pickSboxImage() picks the first non-null.
  iconUrl?: string | null;
  icon?: string | null;
  image?: string | null;
  imageUrl?: string | null;
  thumbnail?: string | null;
  previewUrl?: string | null;
}

/**
 * Pick the best image URL from a sbox.dev skin payload. The API
 * doesn't document its image field name + has shipped under several
 * over time, so we do two passes:
 *
 *   1. Probe known-likely top-level field names (cheap, deterministic)
 *   2. Recursively walk the whole response looking for any string
 *      that looks like an image URL — handles nested shapes like
 *      `media.icon`, `assets[0].url`, `images.preview`, etc.
 *
 * Pass-2 self-heals when sbox.dev renames a field or moves the icon
 * into a sub-object — at the small cost of occasionally picking up
 * an unrelated image (a contributor avatar, etc.) if the per-skin
 * payload contains both. Tradeoff is worth it: empty image looks
 * broken, wrong-but-similar image is acceptable until corrected.
 */
function pickSboxImage(skin: SboxSkinData): string | null {
  const candidates = [
    skin.iconUrl,
    skin.imageUrl,
    skin.image,
    skin.icon,
    skin.thumbnail,
    skin.previewUrl,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.length > 0) return c;
  }

  // Pass 2: recursive walk. Looking for a string value whose key
  // hints at "image" or whose value matches a URL pattern with an
  // image extension. Skips obvious avatar/profile fields so we
  // don't pick up a top-holder profile avatar by accident.
  const found = findFirstImageUrl(skin as unknown);
  return found;
}

const IMAGE_EXT_RE = /\.(?:png|jpe?g|webp|gif|avif)(?:\?|$)/i;
const IMAGE_KEY_HINT_RE = /(?:^|[^a-z])(icon|image|thumb|preview)/i;
const SKIP_KEY_RE = /(?:avatar|profile|owner|holder|user)/i;
const URL_RE = /^https?:\/\//i;

/**
 * Walk an arbitrary JSON tree and return the first string value that
 * looks like an image URL. Prefers values whose key contains an image
 * hint ("icon", "image", etc.); fields that obviously belong to a
 * person (avatar, profile, user) are skipped so a top-holder list
 * can't pollute the item's own image. BFS so shallower wins.
 */
function findFirstImageUrl(root: unknown): string | null {
  type Frame = { node: unknown; keyHint: boolean };
  const queue: Frame[] = [{ node: root, keyHint: false }];
  let fallback: string | null = null;
  while (queue.length) {
    const { node, keyHint } = queue.shift() as Frame;
    if (typeof node === "string") {
      if (URL_RE.test(node) && IMAGE_EXT_RE.test(node)) {
        if (keyHint) return node;
        if (!fallback) fallback = node;
      }
      continue;
    }
    if (Array.isArray(node)) {
      for (const item of node) queue.push({ node: item, keyHint });
      continue;
    }
    if (node && typeof node === "object") {
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        if (SKIP_KEY_RE.test(k)) continue;
        const childHint = keyHint || IMAGE_KEY_HINT_RE.test(k);
        queue.push({ node: v, keyHint: childHint });
      }
    }
  }
  return fallback;
}

interface SboxSupplyData {
  trackedOwnerCount: number;
  trackedQuantity: number;
  communityMarketQuantity: number;
  communityMarketValue: number;
  topHolders: {
    profile: { name: string; steamId: string; avatarUrl: string };
    quantity: number;
    inventoryValueSharePercent: number;
  }[];
}

async function fetchSboxSkin(slug: string): Promise<SboxSkinData | null> {
  try {
    const res = await fetch(`https://api.sbox.dev/v1/skins/${slug}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.data ?? null;
  } catch {
    return null;
  }
}

/**
 * Per-item image scrape for slugs whose API response doesn't include
 * the icon URL. sbox.dev/skins/<slug> is server-side rendered with the
 * image in <meta property="og:image"> (and a main <img> fallback).
 * Both point at sbox.dev's Cloudflare image-resize wrapper around
 * cdn.sbox.game/asset/<hash>.png — which is the actual Facepunch CDN
 * image.
 *
 * We prefer the unwrapped cdn.sbox.game URL when we can extract it
 * (smaller dependency footprint — sbox.dev could pull their resizer
 * tomorrow and our images would still resolve through Facepunch's CDN
 * directly).
 */
async function fetchSboxSkinImage(slug: string): Promise<string | null> {
  // Try sbox.dev's per-skin page first (richer SSR'd metadata) then
  // fall back to sbox.game in case sbox.dev rate-limits us or the
  // slug pattern differs.
  const pages = [
    `https://sbox.dev/skins/${slug}`,
    `https://sbox.game/skins/${slug}`,
  ];
  for (const url of pages) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) continue;
      const html = await res.text();
      const found = extractImageFromHtml(html);
      if (found) return found;
    } catch {
      // next page
    }
  }
  return null;
}

/**
 * Pull the canonical item icon out of an sbox.dev page's HTML. Tries:
 *   1. <meta property="og:image" content="...">
 *   2. <meta name="twitter:image" content="...">
 *   3. The first cdn.sbox.game/asset URL anywhere in the HTML
 *
 * Returns the **unwrapped** cdn.sbox.game URL when it's nested inside
 * a sbox.dev/cdn-cgi/image/ resize wrapper — that's what we want to
 * store. The resize wrapper is just a CDN convenience and adds a
 * sbox.dev dependency we don't need.
 */
function extractImageFromHtml(html: string): string | null {
  const ogMatch = html.match(
    /<meta\s+(?:property|name)=["'](?:og:image|twitter:image)["']\s+content=["']([^"']+)["']/i,
  );
  const candidates: string[] = [];
  if (ogMatch?.[1]) candidates.push(ogMatch[1]);

  // Bare cdn.sbox.game URL anywhere in the doc — resilient if sbox.dev
  // ever drops the og:image. Also captures avatars etc., so we filter
  // to /asset/ paths which are the item icons (avatars sit under
  // /steam/ or similar).
  const cdnRe = /https:\/\/cdn\.sbox\.game\/asset\/[a-z0-9./_-]+\.(?:png|jpe?g|webp|gif|avif)/gi;
  let m: RegExpExecArray | null;
  while ((m = cdnRe.exec(html)) !== null) {
    candidates.push(m[0]);
  }

  for (const c of candidates) {
    const unwrapped = unwrapCdnCgi(c);
    if (unwrapped) return unwrapped;
  }
  return null;
}

/**
 * Unwrap sbox.dev/cdn-cgi/image/<options>/<real-url> back to <real-url>
 * so we store the underlying Facepunch CDN URL rather than sbox.dev's
 * resizer wrapper. Pass-through if the URL isn't a cdn-cgi wrapper.
 */
function unwrapCdnCgi(url: string): string | null {
  if (!url) return null;
  // Pattern: https://sbox.dev/cdn-cgi/image/<opts>/<inner-url>
  const match = url.match(
    /^https?:\/\/sbox\.dev\/cdn-cgi\/image\/[^/]+\/(https?:\/\/.+)$/i,
  );
  if (match?.[1]) return match[1];
  return url;
}

/**
 * Extract Facepunch-canonical metrics for an item from
 * sbox.game/metrics/skins/<id>. The id can be either the workshopId
 * we store on Item, or the sbox.game internal numeric id (some items
 * route through both — sbox.game seems forgiving). We try both forms.
 *
 * Returns a partial Item-shape: only the fields we could parse out.
 * Caller decides what to write — typically only fills nullables that
 * sbox.dev didn't already provide.
 *
 * Implementation parses the HTML page rather than calling an API
 * because sbox.game doesn't document a public API surface. The page
 * is mostly server-side rendered with the data either in:
 *   1. <script id="__NEXT_DATA__"> (Next.js)
 *   2. inline <script type="application/json"> islands
 *   3. plain HTML cells with class hints we can regex-match
 *
 * findSkinDataInJson() walks any JSON we extract looking for
 * skin-shaped fields. Keys we care about: name, totalSupply,
 * uniqueOwners, currentPrice, supplyOnMarket, totalSales, image.
 */
export interface SboxGameMetrics {
  name?: string;
  totalSupply?: number;
  uniqueOwners?: number;
  currentPrice?: number;
  supplyOnMarket?: number;
  totalSales?: number;
  imageUrl?: string;
  /** Diagnostics — surfaced via debug endpoint */
  rawJsonKeys?: string[];
  matchedSelector?: string;
}

export async function fetchSboxGameMetrics(
  idOrWorkshopId: string,
): Promise<SboxGameMetrics | null> {
  if (!idOrWorkshopId) return null;
  const url = `https://sbox.game/metrics/skins/${encodeURIComponent(idOrWorkshopId)}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const html = await res.text();
    return parseSboxGameMetrics(html);
  } catch {
    return null;
  }
}

export function parseSboxGameMetrics(html: string): SboxGameMetrics {
  const out: SboxGameMetrics = {};

  // 1. Try the Next.js / generic JSON island route first. Most reliable
  //    when the page embeds its full state.
  const jsonCandidates: string[] = [];
  const nextMatch = html.match(
    /<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i,
  );
  if (nextMatch?.[1]) jsonCandidates.push(nextMatch[1]);
  const islandRe =
    /<script[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let mIsland: RegExpExecArray | null;
  while ((mIsland = islandRe.exec(html)) !== null) {
    if (mIsland[1]) jsonCandidates.push(mIsland[1]);
  }

  for (const raw of jsonCandidates) {
    try {
      const parsed = JSON.parse(raw);
      const found = findSkinDataInJson(parsed);
      if (found) {
        out.matchedSelector = "json-island";
        out.rawJsonKeys = Object.keys(found);
        if (typeof found.name === "string") out.name = found.name;
        if (typeof found.totalSupply === "number") out.totalSupply = found.totalSupply;
        if (typeof found.uniqueOwners === "number") out.uniqueOwners = found.uniqueOwners;
        if (typeof found.currentPrice === "number") out.currentPrice = found.currentPrice;
        if (typeof found.price === "number" && out.currentPrice == null)
          out.currentPrice = found.price as number;
        if (typeof found.supplyOnMarket === "number")
          out.supplyOnMarket = found.supplyOnMarket;
        if (typeof found.sales === "number") out.totalSales = found.sales;
        if (typeof found.totalSales === "number") out.totalSales = found.totalSales;
        break;
      }
    } catch {
      // try next candidate
    }
  }

  // 2. og:image (always works on Facepunch SSR'd pages even when JSON
  //    is somewhere we didn't catch).
  const ogMatch = html.match(
    /<meta\s+(?:property|name)=["']og:image["']\s+content=["']([^"']+)["']/i,
  );
  if (ogMatch?.[1]) {
    const u = unwrapCdnCgi(ogMatch[1]);
    if (u) out.imageUrl = u;
  }

  // 3. Title fallback. <title>Item Name · sbox.game</title> pattern.
  if (!out.name) {
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    if (titleMatch?.[1]) {
      out.name = titleMatch[1]
        .replace(/\s*[·|–-]\s*sbox\.game.*$/i, "")
        .trim() || undefined;
    }
  }

  // 4. Plain-HTML cell heuristics — last resort. The metrics page
  //    likely has data-testid or class names like "supply" / "owners".
  //    Pattern: <* class="...supply...">12,345</*>. Defensive against
  //    layout changes — broad selector match, narrow value extraction.
  if (out.totalSupply == null) {
    const supplyMatch = html.match(
      /(?:supply|total[\s_-]*supply)[\s\S]{0,200}?(\d[\d,]*)/i,
    );
    if (supplyMatch?.[1]) {
      const n = parseInt(supplyMatch[1].replace(/,/g, ""), 10);
      if (Number.isFinite(n) && n > 0) out.totalSupply = n;
    }
  }
  if (out.uniqueOwners == null) {
    const ownersMatch = html.match(
      /(?:unique[\s_-]*owners|owners)[\s\S]{0,200}?(\d[\d,]*)/i,
    );
    if (ownersMatch?.[1]) {
      const n = parseInt(ownersMatch[1].replace(/,/g, ""), 10);
      if (Number.isFinite(n) && n > 0) out.uniqueOwners = n;
    }
  }

  return out;
}

/**
 * Walk a parsed JSON tree looking for an object that smells like a
 * skin record: has a `name` field plus at least one of the metrics
 * we care about. BFS — shallowest match wins so we don't dive into
 * a list of related items and pick the wrong one.
 */
function findSkinDataInJson(
  root: unknown,
): Record<string, unknown> | null {
  const queue: unknown[] = [root];
  while (queue.length) {
    const node = queue.shift();
    if (Array.isArray(node)) {
      queue.push(...node);
      continue;
    }
    if (node && typeof node === "object") {
      const obj = node as Record<string, unknown>;
      // Skin-record heuristic
      if (
        typeof obj.name === "string" &&
        (typeof obj.totalSupply === "number" ||
          typeof obj.uniqueOwners === "number" ||
          typeof obj.supplyOnMarket === "number" ||
          typeof obj.price === "number" ||
          typeof obj.currentPrice === "number")
      ) {
        return obj;
      }
      for (const v of Object.values(obj)) queue.push(v);
    }
  }
  return null;
}

async function fetchSboxSupply(slug: string): Promise<SboxSupplyData | null> {
  try {
    const res = await fetch(`https://api.sbox.dev/v1/skins/${slug}/supply-sources`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.data ?? null;
  } catch {
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Items whose sbox.dev data was refreshed within this window are skipped.
const SBOX_SYNC_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

/**
 * List endpoint candidates — sbox.dev hasn't documented their public list
 * surface, so we probe in order and use the first one that returns a
 * usable shape. Order matters: the most-specific filter goes first so
 * we don't pull the entire catalog when a smaller scope works.
 *
 * If none of these resolve, the caller logs and skips — we still have
 * the per-slug enrichment path for items already in our DB. Discovery
 * just won't pick up brand-new store entries until either sbox.dev
 * exposes a list or we wire a different source (Facepunch services
 * API is the long-term plan).
 */
const SBOX_LIST_CANDIDATES: string[] = [
  // sbox.dev API surface — broadest probe set since their list endpoint
  // isn't documented anywhere we've found. Order: most-specific first
  // so we don't pull the entire catalog when a smaller scope works.
  "https://api.sbox.dev/v1/skins?store=active",
  "https://api.sbox.dev/v1/skins?activeStoreItem=true",
  "https://api.sbox.dev/v1/skins?isActiveStoreItem=true",
  "https://api.sbox.dev/v1/skins?limit=500",
  "https://api.sbox.dev/v1/skins?perPage=500",
  "https://api.sbox.dev/v1/skins?page=1&limit=500",
  "https://api.sbox.dev/v1/skins",
  "https://api.sbox.dev/v1/skins/list",
  "https://api.sbox.dev/v1/skins/all",
  "https://api.sbox.dev/v1/skins/index",
  "https://api.sbox.dev/v1/store",
  "https://api.sbox.dev/v1/store/skins",
  "https://api.sbox.dev/v1/store/items",
  // Versioning variants in case they bumped to v2 / unversioned
  "https://api.sbox.dev/v2/skins",
  "https://api.sbox.dev/skins",
  // Some APIs route through the apex domain instead of an `api` subdomain
  "https://sbox.dev/api/skins",
  "https://sbox.dev/api/v1/skins",
  "https://sbox.dev/api/store",
];

/**
 * URLs to try as an HTML scrape fallback if the API candidates whiff.
 * Many SSR'd pages (especially Next.js / Nuxt) embed the catalog data
 * inside a __NEXT_DATA__ / __NUXT__ / nuxt-data <script> tag — we can
 * extract it without a JS runtime. The page-source approach is what we
 * use as a last resort before giving up and emitting an error.
 */
const SBOX_HTML_CANDIDATES: string[] = [
  "https://sbox.dev/store",
  "https://sbox.dev/skins",
];

/**
 * Probe sbox.dev for a list of skins. Three layers, in order:
 *   1. Direct API candidates (SBOX_LIST_CANDIDATES) — fastest, most
 *      structured, lowest chance of breakage when their HTML changes.
 *   2. HTML scrape of sbox.dev/store and similar pages — pulls
 *      __NEXT_DATA__ / __NUXT__ / inline JSON if their site embeds
 *      the catalog SSR-style.
 *   3. Returns diagnostic attempt log via fetchSboxSkinsListDetailed
 *      below — used by the debug endpoint to surface what's working.
 *
 * Returns [] if everything fails — caller logs and continues. Per-
 * slug enrichment still works for items already in our DB; only
 * brand-new-item discovery is gated on this function succeeding.
 */
async function fetchSboxSkinsList(): Promise<SboxSkinData[]> {
  const detailed = await fetchSboxSkinsListDetailed();
  return detailed.skins;
}

export interface ListProbeResult {
  skins: SboxSkinData[];
  source: string | null;
  attempts: ProbeAttempt[];
}

interface ProbeAttempt {
  url: string;
  method: "api" | "html";
  status: number | null;
  bytes: number | null;
  parsedCount: number;
  error?: string;
}

export async function fetchSboxSkinsListDetailed(): Promise<ListProbeResult> {
  const attempts: ProbeAttempt[] = [];

  // --- Pass 1: API candidates ---
  for (const url of SBOX_LIST_CANDIDATES) {
    const a: ProbeAttempt = {
      url,
      method: "api",
      status: null,
      bytes: null,
      parsedCount: 0,
    };
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      a.status = res.status;
      const text = await res.text();
      a.bytes = text.length;
      if (!res.ok) {
        attempts.push(a);
        continue;
      }
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch (err) {
        a.error = `parse: ${err instanceof Error ? err.message : String(err)}`;
        attempts.push(a);
        continue;
      }
      const arr = extractSkinList(json);
      a.parsedCount = arr.length;
      attempts.push(a);
      if (arr.length > 0) {
        return { skins: arr, source: url, attempts };
      }
    } catch (err) {
      a.error = err instanceof Error ? err.message : String(err);
      attempts.push(a);
    }
  }

  // --- Pass 2: HTML scrape fallback ---
  for (const url of SBOX_HTML_CANDIDATES) {
    const a: ProbeAttempt = {
      url,
      method: "html",
      status: null,
      bytes: null,
      parsedCount: 0,
    };
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      a.status = res.status;
      const html = await res.text();
      a.bytes = html.length;
      if (!res.ok) {
        attempts.push(a);
        continue;
      }
      const arr = extractSkinsFromHtml(html);
      a.parsedCount = arr.length;
      attempts.push(a);
      if (arr.length > 0) {
        return { skins: arr, source: `${url} (html)`, attempts };
      }
    } catch (err) {
      a.error = err instanceof Error ? err.message : String(err);
      attempts.push(a);
    }
  }

  return { skins: [], source: null, attempts };
}

/**
 * Pull a skins array out of an HTML page by digging into common SSR
 * data containers. Order:
 *   1. <script id="__NEXT_DATA__">…</script>  (Next.js)
 *   2. window.__NUXT__ = {...}                (Nuxt)
 *   3. <script type="application/json">       (generic JSON island)
 *
 * For each, parse the JSON then walk for an array-of-skins. We don't
 * know the exact key path so we use the same recursive scanner as the
 * API extractor — find any array of objects whose first member has a
 * `slug` and a `name`, on the assumption that's the skin list.
 */
function extractSkinsFromHtml(html: string): SboxSkinData[] {
  // 1. Embedded-JSON paths (Next.js / Nuxt / generic islands). sbox.dev
  //    doesn't appear to use any of these — debug-sbox-list returned
  //    235KB of HTML with 0 parsed skins — but we keep the probe in
  //    case they ever switch frameworks.
  const candidates: string[] = [];

  const nextMatch = html.match(
    /<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i,
  );
  if (nextMatch?.[1]) candidates.push(nextMatch[1]);

  const nuxtMatch = html.match(/window\.__NUXT__\s*=\s*({[\s\S]*?})\s*;\s*</);
  if (nuxtMatch?.[1]) candidates.push(nuxtMatch[1]);

  const islandRe =
    /<script[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = islandRe.exec(html)) !== null) {
    if (m[1]) candidates.push(m[1]);
  }

  for (const raw of candidates) {
    try {
      const json = JSON.parse(raw);
      const arr = findSkinArray(json);
      if (arr.length > 0) return arr;
    } catch {
      // Next candidate.
    }
  }

  // 2. Anchor-href fallback. sbox.dev/store renders skin cards as
  //    <a href="/skins/<slug>">…</a> — extract every unique slug,
  //    then return them as minimal skin records ({ slug, name }).
  //    Per-skin enrichment fills in everything else when we
  //    seedItemFromSboxDev() each.
  //
  //    Why this works: the discover loop only needs slugs to know
  //    "is this in our DB yet?" — full data lands on the next
  //    enrichment pass via fetchSboxSkin(slug).
  const slugs = extractSlugsFromHtml(html);
  return slugs.map(({ slug, name }) =>
    ({
      slug,
      name: name ?? slug,
    }) as SboxSkinData,
  );
}

/**
 * Extract unique skin slugs from a sbox.dev page's HTML by regex-
 * matching `<a href="/skins/<slug>">…</a>` patterns. Captures the
 * anchor's text content as a name hint when present, so the discover
 * loop can show something useful before the per-skin enrichment lands.
 *
 * Filters out non-skin link patterns (e.g. /skins/categories/...,
 * /skins/featured, etc.) by requiring the slug to be lowercase
 * alphanumeric with dashes only.
 */
function extractSlugsFromHtml(
  html: string,
): Array<{ slug: string; name?: string }> {
  const seen = new Map<string, string | undefined>();
  // Match <a ... href="/skins/<slug>" ...>name</a>. Greedy on
  // attribute order; tolerant of self-closing or nested tags
  // inside the anchor.
  const re =
    /<a\b[^>]*href=["']\/skins\/([a-z0-9][a-z0-9-]*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const slug = m[1];
    if (!slug || seen.has(slug)) continue;
    // Skip obvious non-item slugs.
    if (slug === "categories" || slug === "featured" || slug === "new") continue;
    // Best-effort name extraction: strip nested tags from inner HTML,
    // collapse whitespace, take the first chunk that looks textual.
    const inner = m[2] ?? "";
    const text =
      inner
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim() || undefined;
    seen.set(slug, text);
  }
  return [...seen.entries()].map(([slug, name]) => ({ slug, name }));
}

function findSkinArray(node: unknown): SboxSkinData[] {
  if (Array.isArray(node)) {
    if (
      node.length > 0 &&
      typeof node[0] === "object" &&
      node[0] !== null &&
      typeof (node[0] as Record<string, unknown>).slug === "string" &&
      typeof (node[0] as Record<string, unknown>).name === "string"
    ) {
      return node as SboxSkinData[];
    }
  }
  if (node && typeof node === "object") {
    for (const v of Object.values(node as Record<string, unknown>)) {
      const found = findSkinArray(v);
      if (found.length > 0) return found;
    }
  }
  return [];
}

function extractSkinList(json: unknown): SboxSkinData[] {
  if (Array.isArray(json)) return json as SboxSkinData[];
  if (json && typeof json === "object") {
    const obj = json as Record<string, unknown>;
    if (Array.isArray(obj.data)) return obj.data as SboxSkinData[];
    if (Array.isArray(obj.skins)) return obj.skins as SboxSkinData[];
    if (Array.isArray(obj.items)) return obj.items as SboxSkinData[];
    if (obj.data && typeof obj.data === "object") {
      const d = obj.data as Record<string, unknown>;
      if (Array.isArray(d.skins)) return d.skins as SboxSkinData[];
      if (Array.isArray(d.items)) return d.items as SboxSkinData[];
    }
  }
  return [];
}

export interface DiscoverResult {
  listSize: number;
  newItemsSeeded: number;
  rotationFlipped: number;
  errors: string[];
  elapsedMs: number;
}

/**
 * Discover new skins from sbox.dev's catalog list and seed any that
 * aren't already in our DB. Also force-updates `isActiveStoreItem` /
 * `isPermanentStoreItem` / `leavingStoreAt` for items already known to
 * us — bypasses the 1h per-item cooldown so a store rotation that
 * happens between regular sync runs gets reflected immediately.
 *
 * Used by the /api/cron/sbox-discover cron (4x/day) and on demand from
 * the admin UI. The regular /api/sync still does its own
 * paginated-Steam-Market scrape — discovery is purely additive,
 * filling the catalog gaps that Steam Market doesn't surface.
 */
export async function discoverSboxSkins(): Promise<DiscoverResult> {
  const startedAt = Date.now();
  const result: DiscoverResult = {
    listSize: 0,
    newItemsSeeded: 0,
    rotationFlipped: 0,
    errors: [],
    elapsedMs: 0,
  };

  const list = await fetchSboxSkinsList();
  result.listSize = list.length;
  if (list.length === 0) {
    result.errors.push(
      "no list endpoint returned data (sbox.dev may not expose one)",
    );
    result.elapsedMs = Date.now() - startedAt;
    return result;
  }

  // Snapshot existing slugs so we know what to skip vs seed.
  const existing = await prisma.item.findMany({
    select: { id: true, slug: true, isActiveStoreItem: true },
  });
  const bySlug = new Map(existing.map((i) => [i.slug, i]));

  for (const skin of list) {
    if (!skin || typeof skin.slug !== "string" || !skin.slug) continue;
    const known = bySlug.get(skin.slug);

    if (!known) {
      // New item — seed it via the existing helper, which writes the
      // full set of fields the per-item enrichment also writes.
      try {
        const seedResult: SyncResult = {
          success: true,
          itemsProcessed: 0,
          itemsCreated: 0,
          itemsUpdated: 0,
          pricePointsCreated: 0,
          errors: [],
          duration: 0,
        };
        const r = await seedItemFromSboxDev(skin.slug, seedResult);
        if (r.itemId) result.newItemsSeeded++;
        if (seedResult.errors.length > 0) {
          result.errors.push(...seedResult.errors);
        }
      } catch (err) {
        result.errors.push(
          `seed ${skin.slug}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      continue;
    }

    // Known item — refresh just the rotation flags. Bypass the
    // sboxSyncedAt cooldown so a freshly-rotated store change shows
    // up within the discover-cron cadence rather than waiting for the
    // 1h per-item enrichment window.
    if (
      typeof skin.isActiveStoreItem === "boolean" &&
      skin.isActiveStoreItem !== known.isActiveStoreItem
    ) {
      try {
        await prisma.item.update({
          where: { id: known.id },
          data: {
            isActiveStoreItem: skin.isActiveStoreItem,
            isPermanentStoreItem: !!skin.isPermanentStoreItem,
            leavingStoreAt: skin.leavingStoreAt
              ? new Date(skin.leavingStoreAt)
              : null,
          },
        });
        result.rotationFlipped++;
      } catch (err) {
        result.errors.push(
          `flip ${skin.slug}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  result.elapsedMs = Date.now() - startedAt;
  return result;
}

/**
 * Enrich items with data from the sbox.dev API.
 *
 * Design choices (defensive — our data pipeline depends on this staying up):
 *  - Serial with randomized 50-150ms jitter between requests → looks like
 *    organic page loads, not a burst-scraper.
 *  - Skip items synced within the last hour → cuts our request volume ~4x
 *    and keeps us under the radar.
 *  - No custom User-Agent → blends into Vercel traffic; a targeted ban would
 *    need to block the whole Vercel IP range.
 *  - On fetch failure, keep existing DB data → stale numbers beat "N/A".
 */
export async function syncSboxData(
  opts: { force?: boolean } = {},
): Promise<{ updated: number; skipped: number; errors: string[] }> {
  const cooldownCutoff = new Date(Date.now() - SBOX_SYNC_COOLDOWN_MS);
  const items = await prisma.item.findMany({
    where: opts.force
      ? undefined
      : {
          OR: [{ sboxSyncedAt: null }, { sboxSyncedAt: { lt: cooldownCutoff } }],
        },
    select: { id: true, slug: true, name: true, imageUrl: true },
  });

  const skippedCount = opts.force
    ? 0
    : await prisma.item.count({
        where: { sboxSyncedAt: { gte: cooldownCutoff } },
      });

  debug(
    `[sbox] Enriching ${items.length} items from sbox.dev (skipping ${skippedCount} synced <1h ago)...`,
  );
  let updated = 0;
  const errors: string[] = [];

  for (const item of items) {
    try {
      const skin = await fetchSboxSkin(item.slug);
      if (!skin) {
        // Keep existing data; just note the gap. No sboxSyncedAt bump.
        debug(`[sbox] No data for "${item.name}" (${item.slug}) — keeping stale data`);
        await sleep(50 + Math.random() * 100);
        continue;
      }

      // Small pause before the second request to the same host
      await sleep(50 + Math.random() * 100);
      const supply = await fetchSboxSupply(item.slug);

      // Only rebuild topHolders when the supply fetch succeeded. If it failed,
      // we keep the last-known topHolders in the DB (AGENTS.md #2 — stale
      // beats null). Supply fetches fail independently of skin fetches, so
      // without this guard, any sbox.dev hiccup would wipe holder data for
      // the whole catalog over a single sync pass.
      const topHolders = supply
        ? supply.topHolders?.map((h) => ({
            name: h.profile.name,
            steamId: h.profile.steamId,
            avatarUrl: h.profile.avatarUrl,
            quantity: h.quantity,
            sharePercent: h.inventoryValueSharePercent,
          })) ?? null
        : undefined;

      // Compute scarcity score from the freshest data
      const scarcityScore = computeScarcityScore({
        totalSupply: skin.totalSupply,
        uniqueOwners: skin.uniqueOwners,
        supplyOnMarket: skin.supplyOnMarket,
        soldPast24h: skin.soldPast24H ?? skin.boughtInTheLast24H,
        price: skin.price,
        priceChange24hPercent: skin.priceChange24hPercent,
      });

      // Guard isActiveStoreItem: if the API ever omits this bool (not typed
      // as optional, but APIs lie), treat as "unknown" and keep the existing
      // storeStatus rather than flipping active items to "delisted".
      const storeStatus =
        skin.isActiveStoreItem === true
          ? "available"
          : skin.isActiveStoreItem === false
            ? "delisted"
            : undefined;

      // Backfill imageUrl when missing — items seeded from sbox.dev
      // (Hard Hat-style, never on Steam Market) wouldn't otherwise get
      // an image. Two-tier: try the API payload first, fall back to
      // scraping the per-skin page's og:image metadata (which points at
      // cdn.sbox.game/asset/<hash>.png — the actual Facepunch CDN
      // image). Only writes when our row is null so a fresh Steam
      // image isn't overwritten.
      let sboxImage: string | null = pickSboxImage(skin);
      if (!item.imageUrl && !sboxImage) {
        sboxImage = await fetchSboxSkinImage(item.slug);
      }
      const fillImage =
        !item.imageUrl && sboxImage ? { imageUrl: sboxImage } : {};

      await prisma.item.update({
        where: { id: item.id },
        data: {
          ...fillImage,
          totalSupply: skin.totalSupply,
          uniqueOwners: skin.uniqueOwners,
          soldPast24h: skin.soldPast24H ?? skin.boughtInTheLast24H,
          supplyOnMarket: skin.supplyOnMarket,
          totalSales: skin.sales,
          isActiveStoreItem: skin.isActiveStoreItem,
          isPermanentStoreItem: skin.isPermanentStoreItem,
          leavingStoreAt: skin.leavingStoreAt ? new Date(skin.leavingStoreAt) : null,
          releaseDate: skin.release ? new Date(skin.release) : null,
          releasePrice: skin.releasePrice,
          // sbox.dev's `releasePrice` is the authoritative "original store
          // price" signal — populated for every item with a release record.
          // The legacy `storePrice` column was sourced from the
          // sbox.game Playwright scraper which often fails to extract a
          // number from the live store HTML, leaving rows null. Mirror
          // the sbox.dev value in so every consumer (item detail page,
          // share card, /store, reddit, export) has a usable price.
          // Using ?? so a null from sbox.dev doesn't clobber a value the
          // scraper happened to capture.
          ...(skin.releasePrice != null
            ? { storePrice: skin.releasePrice }
            : {}),
          itemDisplayName: skin.itemDisplayName,
          category: skin.category,
          itemSubType: skin.itemType,
          workshopId: skin.workshopId,
          priceChange6h: skin.priceChange6h,
          priceChange6hPercent: skin.priceChange6hPercent,
          iconBackgroundColor: skin.iconBackgroundColor,
          // Only include topHolders when supply fetch succeeded (see above).
          ...(topHolders !== undefined
            ? { topHolders: topHolders ?? Prisma.JsonNull }
            : {}),
          // Only include storeStatus when the upstream bool was defined.
          ...(storeStatus !== undefined ? { storeStatus } : {}),
          sboxSyncedAt: new Date(),
          scarcityScore,
        },
      });
      updated++;

      // Jitter between items — spread the burst, look organic
      await sleep(50 + Math.random() * 100);
    } catch (err) {
      errors.push(`sbox sync "${item.name}": ${err}`);
    }
  }

  debug(
    `[sbox] Done: ${updated}/${items.length} enriched, ${skippedCount} skipped, ${errors.length} errors`,
  );
  return { updated, skipped: skippedCount, errors };
}

// ---------------------------------------------------------------------------
// Scarcity score — our signature metric
// ---------------------------------------------------------------------------

/**
 * Composite scarcity score (0-100). Higher = rarer/tighter market.
 *
 * Components:
 *  - Concentration (40%): supply / uniqueOwners. Fewer owners per copy = tightly held.
 *    1.0 owner/supply = perfectly distributed, low scarcity
 *    3+ supply per owner = concentrated in whales
 *  - Liquidity (40%): supplyOnMarket / totalSupply.
 *    Low percent on market = holders aren't selling = scarce
 *  - Momentum (20%): absolute 24h price change.
 *    Big recent moves = active scarcity or oversupply events
 *
 * Missing inputs default to neutral (50) so items with partial data still rank.
 */
export function computeScarcityScore(input: {
  totalSupply: number | null;
  uniqueOwners: number | null;
  supplyOnMarket: number | null;
  soldPast24h: number | null;
  price: number | null;
  priceChange24hPercent: number | null;
}): number {
  // totalSupply === 0 is its own edge case (pre-release, delisted with
  // no remaining supply). Treat as maximum scarcity rather than neutral.
  if (input.totalSupply === 0) return 100;

  let concentration = 50;
  if (input.totalSupply && input.uniqueOwners && input.uniqueOwners > 0) {
    const perOwner = input.totalSupply / input.uniqueOwners;
    // Linear map: 1.0 per-owner → 0 (broadly distributed)
    //            10.0 per-owner → 100 (whale-dominated)
    // Previous multiplier (15) hit 100 at 7.67 per-owner, drifting from the
    // documented range. 100/9 ≈ 11.11 gives us the full 1-10 runway.
    concentration = Math.max(0, Math.min(100, (perOwner - 1) * (100 / 9)));
  }

  let illiquidity = 50;
  if (
    input.totalSupply &&
    input.supplyOnMarket != null &&
    input.totalSupply > 0
  ) {
    // Clamp supplyOnMarket to totalSupply — sbox.dev data sometimes has
    // pending-trade items counted on both sides, pushing the ratio >100%.
    const onMarket = Math.min(input.supplyOnMarket, input.totalSupply);
    const marketPct = (onMarket / input.totalSupply) * 100;
    illiquidity = Math.max(0, Math.min(100, 100 - marketPct * 5));
  }

  let momentum = 0;
  if (input.priceChange24hPercent != null) {
    momentum = Math.min(100, Math.abs(input.priceChange24hPercent) * 5);
  }

  return Math.round(
    concentration * 0.4 + illiquidity * 0.4 + momentum * 0.2,
  );
}

// ---------------------------------------------------------------------------
// Supply history snapshots
// ---------------------------------------------------------------------------

/**
 * Capture a point-in-time snapshot of every item's supply. Called by a daily
 * cron — builds the "supply over time" timeseries that powers per-item
 * supply-trajectory charts.
 */
export async function captureSupplySnapshots(): Promise<{ captured: number }> {
  const items = await prisma.item.findMany({
    where: { totalSupply: { not: null } },
    select: {
      id: true,
      totalSupply: true,
      uniqueOwners: true,
      currentPrice: true,
    },
  });

  if (items.length === 0) return { captured: 0 };

  await prisma.supplySnapshot.createMany({
    data: items.map((i) => ({
      itemId: i.id,
      totalSupply: i.totalSupply!,
      uniqueOwners: i.uniqueOwners,
      price: i.currentPrice,
    })),
  });

  debug(`[supply-snapshot] Captured ${items.length} item snapshots`);
  return { captured: items.length };
}
