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
): Promise<{ itemId: string | null; matchedName: string | null }> {
  const search = await searchMarketByQuery(hashName, 20);
  if (!search || !search.success) {
    return { itemId: null, matchedName: null };
  }

  const match = search.results.find(
    (r) => r.hash_name.toLowerCase() === hashName.toLowerCase(),
  );
  if (!match) {
    return { itemId: null, matchedName: null };
  }

  const itemId = await upsertItem(match, result);
  return { itemId, matchedName: match.name };
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
