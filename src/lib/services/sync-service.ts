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
 * Infer the item type from Steam's type string.
 * S&box items have types like "Hat", "Shirt", "Pants", etc.
 */
function inferItemType(steamType: string): string {
  const t = steamType.toLowerCase();
  if (t.includes("hat") || t.includes("hair") || t.includes("helmet") || t.includes("mask") || t.includes("head")) {
    return "accessory";
  }
  if (t.includes("shirt") || t.includes("jacket") || t.includes("hoodie") || t.includes("coat") || t.includes("top")) {
    return "clothing";
  }
  if (t.includes("pants") || t.includes("shorts") || t.includes("bottom") || t.includes("skirt")) {
    return "clothing";
  }
  if (t.includes("boot") || t.includes("shoe") || t.includes("footwear")) {
    return "clothing";
  }
  if (t.includes("glove")) {
    return "accessory";
  }
  if (t.includes("skin") || t.includes("character") || t.includes("outfit") || t.includes("suit")) {
    return "character";
  }
  if (t.includes("weapon") || t.includes("knife") || t.includes("sword") || t.includes("blade") || t.includes("gun")) {
    return "weapon";
  }
  if (t.includes("tool")) {
    return "tool";
  }
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

    for (const steamItem of steamItems) {
      try {
        await upsertItem(steamItem, result);
        result.itemsProcessed++;
      } catch (error) {
        const msg = `Failed to process item "${steamItem.name}": ${error}`;
        console.error(`[sync] ${msg}`);
        result.errors.push(msg);
      }
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
 * Upsert a single item from Steam search results into the database.
 * Uses steamMarketId (hash_name) as the unique key.
 */
async function upsertItem(
  steamItem: SteamSearchResult,
  result: SyncResult
): Promise<void> {
  const hashName = steamItem.hash_name;
  const slug = slugify(hashName);
  const priceInDollars = steamItem.sell_price / 100; // sell_price is in cents
  const itemType = inferItemType(steamItem.asset_description?.type || "");
  const iconUrl = steamItem.asset_description?.icon_url
    ? getSteamImageUrl(steamItem.asset_description.icon_url)
    : null;

  const data = {
    name: steamItem.name,
    slug,
    steamMarketId: hashName,
    type: itemType,
    imageUrl: iconUrl,
    marketUrl: getMarketUrl(hashName),
    currentPrice: priceInDollars,
    volume: steamItem.sell_listings,
  };

  const existing = await prisma.item.findUnique({
    where: { steamMarketId: hashName },
  });

  if (existing) {
    // Calculate 24h price change
    const priceChange =
      existing.currentPrice && existing.currentPrice > 0
        ? ((priceInDollars - existing.currentPrice) / existing.currentPrice) * 100
        : 0;

    await prisma.item.update({
      where: { steamMarketId: hashName },
      data: {
        ...data,
        priceChange24h: Math.round(priceChange * 100) / 100,
        description: existing.description || undefined,
        imageUrl: iconUrl || existing.imageUrl, // Prefer fresh Steam image, keep existing if none
      },
    });
    result.itemsUpdated++;
  } else {
    await prisma.item.create({ data });
    result.itemsCreated++;
  }

  // Record a price point
  const itemId = existing?.id
    || (await prisma.item.findUnique({ where: { steamMarketId: hashName } }))!.id;

  await prisma.pricePoint.create({
    data: {
      itemId,
      price: priceInDollars,
      volume: steamItem.sell_listings,
    },
  });
  result.pricePointsCreated++;
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
