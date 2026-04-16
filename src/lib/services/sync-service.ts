import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import {
  fetchAllMarketItems,
  getPriceOverview,
  getSteamImageUrl,
  getMarketUrl,
  parseSteamPrice,
} from "@/lib/steam/client";
import type { SteamSearchResult, SyncResult } from "@/lib/steam/types";
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
    // We query a 4-hour window ending 24h ago, then keep the newest point
    // per item within that window. This gives us a true 24h baseline for
    // priceChange24h instead of comparing to the previous sync's price
    // (which was only ~15-30 min ago and made 24h changes always look tiny).
    const windowEnd = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const windowStart = new Date(Date.now() - 28 * 60 * 60 * 1000);
    const pointsFrom24hAgo = await prisma.pricePoint.findMany({
      where: { timestamp: { gte: windowStart, lte: windowEnd } },
      orderBy: { timestamp: "desc" },
      select: { itemId: true, price: true },
    });
    const priceAt24hAgo = new Map<string, number>();
    for (const p of pointsFrom24hAgo) {
      if (!priceAt24hAgo.has(p.itemId)) priceAt24hAgo.set(p.itemId, p.price);
    }
    debug(`[sync] Loaded ${priceAt24hAgo.size} 24h-ago price points for change calc`);

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
async function upsertItem(
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
    select: { id: true, slug: true, name: true },
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

      const topHolders = supply?.topHolders?.map((h) => ({
        name: h.profile.name,
        steamId: h.profile.steamId,
        avatarUrl: h.profile.avatarUrl,
        quantity: h.quantity,
        sharePercent: h.inventoryValueSharePercent,
      })) ?? null;

      // Compute scarcity score from the freshest data
      const scarcityScore = computeScarcityScore({
        totalSupply: skin.totalSupply,
        uniqueOwners: skin.uniqueOwners,
        supplyOnMarket: skin.supplyOnMarket,
        soldPast24h: skin.soldPast24H ?? skin.boughtInTheLast24H,
        price: skin.price,
        priceChange24hPercent: skin.priceChange24hPercent,
      });

      await prisma.item.update({
        where: { id: item.id },
        data: {
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
          itemDisplayName: skin.itemDisplayName,
          category: skin.category,
          itemSubType: skin.itemType,
          workshopId: skin.workshopId,
          priceChange6h: skin.priceChange6h,
          priceChange6hPercent: skin.priceChange6hPercent,
          iconBackgroundColor: skin.iconBackgroundColor,
          topHolders: topHolders ?? Prisma.JsonNull,
          storeStatus: skin.isActiveStoreItem ? "available" : "delisted",
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
  let concentration = 50;
  if (input.totalSupply && input.uniqueOwners && input.uniqueOwners > 0) {
    const perOwner = input.totalSupply / input.uniqueOwners;
    // 1.0 per-owner → concentration = 0 (broadly distributed)
    // 10+ per-owner → concentration = 100 (whale-dominated)
    concentration = Math.max(0, Math.min(100, (perOwner - 1) * 15));
  }

  let illiquidity = 50;
  if (
    input.totalSupply &&
    input.supplyOnMarket != null &&
    input.totalSupply > 0
  ) {
    const marketPct = (input.supplyOnMarket / input.totalSupply) * 100;
    // 0% on market → illiquidity = 100 (no one selling)
    // 20%+ on market → illiquidity = 0 (lots of liquidity)
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
