import { prisma } from "@/lib/db";
import {
  fetchAllMarketItems,
  getPriceOverview,
  getSteamImageUrl,
  getMarketUrl,
  parseSteamPrice,
} from "@/lib/steam/client";
import type { SteamSearchResult, SyncResult } from "@/lib/steam/types";
import { slugify } from "@/lib/utils";

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
    console.log("[sync] Fetching items from Steam Market (appid 590830)...");
    const steamItems = await fetchAllMarketItems();

    if (steamItems.length === 0) {
      result.errors.push("No items returned from Steam Market API — Steam may be rate-limiting or down");
      result.duration = Date.now() - startTime;
      return result;
    }

    console.log(`[sync] Found ${steamItems.length} items on Steam Market`);

    // Log each item name for debugging
    for (const item of steamItems) {
      console.log(`[sync]   - "${item.name}" (hash: ${item.hash_name}, price: $${(item.sell_price / 100).toFixed(2)}, listings: ${item.sell_listings})`);
    }

    // Accumulate price points to write in one batch at the end (avoids N+1)
    const pendingPricePoints: { itemId: string; price: number; volume: number }[] = [];

    for (const steamItem of steamItems) {
      try {
        const itemId = await upsertItem(steamItem, result);
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
      console.log("[sync] Fetching detailed price overviews...");
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
  console.log(
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
 */
async function upsertItem(
  steamItem: SteamSearchResult,
  result: SyncResult
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
    const priceChange =
      existing.currentPrice && existing.currentPrice > 0
        ? ((priceInDollars - existing.currentPrice) / existing.currentPrice) * 100
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

    console.log(`[sync:prices] Processing ${items.length} items...`);

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
  console.log(`[sync:prices] Complete: ${result.itemsProcessed} items in ${result.duration}ms`);
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
      console.log("[cleanup] No non-Steam items found — database is clean");
      result.success = true;
      result.duration = Date.now() - startTime;
      return result;
    }

    console.log(`[cleanup] Found ${fakeItems.length} non-Steam items to remove:`);
    for (const item of fakeItems) {
      console.log(`[cleanup]   - "${item.name}" (slug: ${item.slug})`);
    }

    const fakeIds = fakeItems.map((i) => i.id);

    // Delete associated price points first (cascade should handle this, but be explicit)
    const deletedPoints = await prisma.pricePoint.deleteMany({
      where: { itemId: { in: fakeIds } },
    });
    console.log(`[cleanup] Deleted ${deletedPoints.count} fake price points`);

    // Delete associated price alerts
    const deletedAlerts = await prisma.priceAlert.deleteMany({
      where: { itemId: { in: fakeIds } },
    });
    console.log(`[cleanup] Deleted ${deletedAlerts.count} fake price alerts`);

    // Delete the fake items
    const deleted = await prisma.item.deleteMany({
      where: { id: { in: fakeIds } },
    });
    console.log(`[cleanup] Deleted ${deleted.count} non-Steam items`);

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
  const median = sortedPrices.length > 0
    ? sortedPrices[Math.floor(sortedPrices.length / 2)]
    : null;

  await prisma.marketSnapshot.create({
    data: {
      totalItems: items.length,
      marketCap: items.reduce((sum, i) => sum + (i.currentPrice ?? 0) * (i.volume ?? 0), 0),
      avgPrice: prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : 0,
      medianPrice: median,
      totalVolume: items.reduce((sum, i) => sum + (i.volume ?? 0), 0),
      totalSupply: items.reduce((sum, i) => sum + (i.totalSupply ?? 0), 0) || null,
      floor: sortedPrices.length > 0 ? sortedPrices[0] : null,
      ceiling: sortedPrices.length > 0 ? sortedPrices[sortedPrices.length - 1] : null,
    },
  });

  console.log(`[sync] Market snapshot captured: ${items.length} items, market cap $${items.reduce((sum, i) => sum + (i.currentPrice ?? 0) * (i.volume ?? 0), 0).toFixed(2)}`);
}
