import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  parseSteamProfileUrl,
  resolveVanityUrl,
  fetchInventory,
  getSteamImageUrl,
} from "@/lib/steam/client";

/**
 * GET /api/inventory?url=<steam_profile_url>
 *
 * Fetches a user's public S&box inventory and calculates the total value
 * by matching items against our database prices.
 */
export async function GET(request: NextRequest) {
  const profileInput = request.nextUrl.searchParams.get("url");
  if (!profileInput) {
    return NextResponse.json({ error: "Missing 'url' parameter" }, { status: 400 });
  }

  // 1. Parse the profile URL
  const parsed = parseSteamProfileUrl(profileInput);
  if (!parsed) {
    return NextResponse.json(
      { error: "Invalid Steam profile URL. Use https://steamcommunity.com/profiles/STEAMID64 or https://steamcommunity.com/id/VANITYNAME" },
      { status: 400 }
    );
  }

  // 2. Resolve vanity name to SteamID64 if needed
  let steamid64 = parsed.steamid64;
  if (!steamid64 && parsed.vanityName) {
    steamid64 = (await resolveVanityUrl(parsed.vanityName)) ?? undefined;
    if (!steamid64) {
      return NextResponse.json(
        { error: `Could not resolve Steam profile "${parsed.vanityName}". Make sure the profile URL is correct.` },
        { status: 404 }
      );
    }
  }

  if (!steamid64) {
    return NextResponse.json({ error: "Could not determine SteamID64" }, { status: 400 });
  }

  // 3. Fetch inventory
  const inventory = await fetchInventory(steamid64);
  if (!inventory || inventory.success !== 1) {
    return NextResponse.json(
      { error: "Could not load inventory. Make sure the profile and game details are set to public." },
      { status: 403 }
    );
  }

  if (!inventory.assets || inventory.assets.length === 0) {
    return NextResponse.json({
      steamid64,
      totalItems: 0,
      totalValue: 0,
      items: [],
    });
  }

  // 4. Build description lookup (classid+instanceid -> description)
  const descMap = new Map<string, NonNullable<typeof inventory.descriptions>[0]>();
  if (inventory.descriptions) {
    for (const desc of inventory.descriptions) {
      descMap.set(`${desc.classid}_${desc.instanceid}`, desc);
    }
  }

  // 5. Count items by market_hash_name
  const itemCounts = new Map<string, { count: number; desc: NonNullable<typeof inventory.descriptions>[0] }>();
  for (const asset of inventory.assets) {
    const key = `${asset.classid}_${asset.instanceid}`;
    const desc = descMap.get(key);
    if (!desc) continue;

    const hashName = desc.market_hash_name;
    const existing = itemCounts.get(hashName);
    if (existing) {
      existing.count += parseInt(asset.amount, 10) || 1;
    } else {
      itemCounts.set(hashName, { count: parseInt(asset.amount, 10) || 1, desc });
    }
  }

  // 6. Match against our database prices
  const hashNames = Array.from(itemCounts.keys());
  const dbItems = await prisma.item.findMany({
    where: { steamMarketId: { in: hashNames } },
    select: {
      steamMarketId: true,
      name: true,
      slug: true,
      currentPrice: true,
      imageUrl: true,
      type: true,
    },
  });

  const dbLookup = new Map(dbItems.map((i) => [i.steamMarketId, i]));

  // 7. Build response
  let totalValue = 0;
  const items: {
    name: string;
    slug: string | null;
    type: string;
    imageUrl: string | null;
    quantity: number;
    unitPrice: number | null;
    totalPrice: number | null;
    marketable: boolean;
  }[] = [];

  for (const [hashName, { count, desc }] of itemCounts) {
    const dbItem = dbLookup.get(hashName);
    const unitPrice = dbItem?.currentPrice ?? null;
    const itemTotal = unitPrice !== null ? unitPrice * count : null;
    if (itemTotal !== null) totalValue += itemTotal;

    items.push({
      name: dbItem?.name ?? desc.name,
      slug: dbItem?.slug ?? null,
      type: dbItem?.type ?? desc.type ?? "unknown",
      imageUrl: dbItem?.imageUrl ?? (desc.icon_url ? getSteamImageUrl(desc.icon_url) : null),
      quantity: count,
      unitPrice,
      totalPrice: itemTotal,
      marketable: desc.marketable === 1,
    });
  }

  // Sort by total price descending (most valuable first), unmatchable items last
  items.sort((a, b) => {
    if (a.totalPrice === null && b.totalPrice === null) return 0;
    if (a.totalPrice === null) return 1;
    if (b.totalPrice === null) return -1;
    return b.totalPrice - a.totalPrice;
  });

  return NextResponse.json({
    steamid64,
    totalItems: inventory.assets.length,
    uniqueItems: items.length,
    totalValue: Math.round(totalValue * 100) / 100,
    items,
  });
}
