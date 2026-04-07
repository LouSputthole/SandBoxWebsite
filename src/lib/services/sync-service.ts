import { prisma } from "@/lib/db";
import {
  fetchAllMarketItems,
  getPriceOverview,
  getSteamImageUrl,
  getMarketUrl,
  parseSteamPrice,
} from "@/lib/steam/client";
import { mockItems } from "@/lib/steam/mock-data";
import type { SteamSearchResult, SyncResult } from "@/lib/steam/types";
import { slugify } from "@/lib/utils";

/**
 * Infer the item type from Steam's type string.
 * S&box items have types like "Hat", "Shirt", "Pants", etc.
 */
function inferItemType(steamType: string): string {
  const t = steamType.toLowerCase();
  if (t.includes("hat") || t.includes("hair") || t.includes("helmet") || t.includes("mask")) {
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
  // Default based on common S&box categories
  return "clothing";
}

/**
 * Infer rarity from item price and other signals.
 * Since Steam doesn't provide rarity directly for S&box, we estimate based on price.
 */
function inferRarity(priceInDollars: number): string {
  if (priceInDollars >= 20) return "legendary";
  if (priceInDollars >= 5) return "rare";
  if (priceInDollars >= 1) return "uncommon";
  return "common";
}

/**
 * Sync all items from the Steam Community Market.
 * Fetches the item list, then optionally fetches price details for each.
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
    console.log("[sync] Fetching items from Steam Market...");
    const steamItems = await fetchAllMarketItems();

    if (steamItems.length === 0) {
      result.errors.push("No items returned from Steam Market API");
      result.duration = Date.now() - startTime;
      return result;
    }

    console.log(`[sync] Found ${steamItems.length} items on Steam Market`);

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
      console.log("[sync] Fetching price details...");
      const items = await prisma.item.findMany({
        select: { id: true, name: true, steamMarketId: true },
      });

      for (const item of items) {
        if (!item.steamMarketId) continue;
        try {
          await syncItemPrice(item.id, item.steamMarketId);
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
    `[sync] Complete: ${result.itemsProcessed} processed, ${result.itemsCreated} created, ${result.itemsUpdated} updated in ${result.duration}ms`
  );
  return result;
}

/**
 * Upsert a single item from Steam search results into the database.
 */
async function upsertItem(
  steamItem: SteamSearchResult,
  result: SyncResult
): Promise<void> {
  const hashName = steamItem.hash_name;
  const slug = slugify(hashName);
  const priceInDollars = steamItem.sell_price / 100; // sell_price is in cents
  const itemType = inferItemType(steamItem.asset_description?.type || "");
  const rarity = inferRarity(priceInDollars);
  const iconUrl = steamItem.asset_description?.icon_url
    ? getSteamImageUrl(steamItem.asset_description.icon_url)
    : null;

  const data = {
    name: steamItem.name,
    slug,
    steamMarketId: hashName,
    type: itemType,
    rarity,
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
        // Preserve existing description and rarity if already set
        description: existing.description || undefined,
        rarity: existing.rarity || rarity,
      },
    });
    result.itemsUpdated++;
  } else {
    await prisma.item.create({ data });
    result.itemsCreated++;
  }

  // Record a price point
  await prisma.pricePoint.create({
    data: {
      itemId: existing?.id || (await prisma.item.findUnique({ where: { steamMarketId: hashName } }))!.id,
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
    // Get items sorted by least recently updated
    const items = await prisma.item.findMany({
      where: { steamMarketId: { not: null } },
      select: { id: true, name: true, steamMarketId: true },
      orderBy: { updatedAt: "asc" },
      take: batchSize,
    });

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
  return result;
}

/**
 * Sync from mock data — tests the full upsert pipeline without hitting Steam's API.
 * Useful for development, testing, or when Steam API is unreachable.
 */
export async function syncFromMockData(): Promise<SyncResult> {
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
    for (const item of mockItems) {
      const existing = await prisma.item.findUnique({
        where: { slug: item.slug },
      });

      // Simulate a small price variation
      const priceVariation = 1 + (Math.random() - 0.5) * 0.1;
      const newPrice = Math.round(item.currentPrice * priceVariation * 100) / 100;

      if (existing) {
        const priceChange =
          existing.currentPrice && existing.currentPrice > 0
            ? ((newPrice - existing.currentPrice) / existing.currentPrice) * 100
            : 0;

        await prisma.item.update({
          where: { slug: item.slug },
          data: {
            currentPrice: newPrice,
            priceChange24h: Math.round(priceChange * 100) / 100,
          },
        });
        result.itemsUpdated++;
      } else {
        await prisma.item.create({
          data: {
            name: item.name,
            slug: item.slug,
            description: item.description,
            type: item.type,
            rarity: item.rarity,
            imageUrl: item.imageUrl,
            marketUrl: item.marketUrl,
            currentPrice: newPrice,
            lowestPrice: item.lowestPrice,
            medianPrice: item.medianPrice,
            volume: item.volume,
            priceChange24h: item.priceChange24h,
            isLimited: item.isLimited,
          },
        });
        result.itemsCreated++;
      }

      // Record a price point
      const itemRecord = existing || await prisma.item.findUnique({ where: { slug: item.slug } });
      if (itemRecord) {
        await prisma.pricePoint.create({
          data: {
            itemId: itemRecord.id,
            price: newPrice,
            volume: item.volume,
          },
        });
        result.pricePointsCreated++;
      }

      result.itemsProcessed++;
    }

    result.success = true;
  } catch (error) {
    result.errors.push(`Mock sync failed: ${error}`);
  }

  result.duration = Date.now() - startTime;
  console.log(`[sync:demo] Complete: ${result.itemsProcessed} items in ${result.duration}ms`);
  return result;
}
