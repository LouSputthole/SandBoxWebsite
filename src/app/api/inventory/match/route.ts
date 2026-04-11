import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSteamImageUrl } from "@/lib/steam/client";

interface ClientInventoryItem {
  hashName: string;
  quantity: number;
  name: string;
  type: string;
  iconUrl?: string;
  marketable: number;
}

interface MatchRequestBody {
  items: ClientInventoryItem[];
}

/**
 * POST /api/inventory/match
 *
 * Takes a parsed inventory (from client-side Steam fetch), matches items
 * against our database to enrich with current prices, and returns the
 * full response with total value.
 */
export async function POST(request: NextRequest) {
  let body: MatchRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body || !Array.isArray(body.items)) {
    return NextResponse.json({ error: "Missing 'items' array" }, { status: 400 });
  }

  const hashNames = body.items.map((i) => i.hashName).filter(Boolean);

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

  let totalValue = 0;
  let totalQuantity = 0;
  const items = body.items.map((item) => {
    const dbItem = dbLookup.get(item.hashName);
    const unitPrice = dbItem?.currentPrice ?? null;
    const totalPrice = unitPrice !== null ? unitPrice * item.quantity : null;
    if (totalPrice !== null) totalValue += totalPrice;
    totalQuantity += item.quantity;

    return {
      name: dbItem?.name ?? item.name,
      slug: dbItem?.slug ?? null,
      type: dbItem?.type ?? item.type ?? "unknown",
      imageUrl: dbItem?.imageUrl ?? (item.iconUrl ? getSteamImageUrl(item.iconUrl) : null),
      quantity: item.quantity,
      unitPrice,
      totalPrice,
      marketable: item.marketable === 1,
    };
  });

  items.sort((a, b) => {
    if (a.totalPrice === null && b.totalPrice === null) return 0;
    if (a.totalPrice === null) return 1;
    if (b.totalPrice === null) return -1;
    return b.totalPrice - a.totalPrice;
  });

  return NextResponse.json({
    totalItems: totalQuantity,
    uniqueItems: items.length,
    totalValue: Math.round(totalValue * 100) / 100,
    items,
  });
}
