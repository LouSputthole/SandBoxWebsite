import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * POST /api/sync/store
 *
 * Receives scraped store availability data and updates storeStatus for items.
 * Items present in the store get "available", items previously available but
 * no longer present get "delisted" with a delistedAt timestamp.
 *
 * Body: { items: [{ name: string, storePrice?: number }] }
 */
export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let body: { items?: { name: string; storePrice?: number }[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.items || !Array.isArray(body.items)) {
    return NextResponse.json({ error: "Missing 'items' array" }, { status: 400 });
  }

  const dbItems = await prisma.item.findMany({
    select: { id: true, name: true, storeStatus: true, steamMarketId: true },
  });

  const byName = new Map(dbItems.map((i) => [i.name.toLowerCase(), i]));
  const byMarketId = new Map(
    dbItems.filter((i) => i.steamMarketId).map((i) => [i.steamMarketId!.toLowerCase(), i]),
  );

  // Track which DB items are found in the store
  const foundIds = new Set<string>();
  let matched = 0;
  let unmatched = 0;
  const unmatchedNames: string[] = [];

  for (const { name, storePrice } of body.items) {
    if (!name) continue;

    const item =
      byName.get(name.toLowerCase()) ?? byMarketId.get(name.toLowerCase());

    if (item) {
      foundIds.add(item.id);
      await prisma.item.update({
        where: { id: item.id },
        data: {
          storeStatus: "available",
          delistedAt: null,
          ...(storePrice != null ? { storePrice } : {}),
        },
      });
      matched++;
    } else {
      unmatched++;
      unmatchedNames.push(name);
    }
  }

  // Mark previously-available items as delisted if they're no longer in the store
  let delisted = 0;
  for (const item of dbItems) {
    if (item.storeStatus === "available" && !foundIds.has(item.id)) {
      await prisma.item.update({
        where: { id: item.id },
        data: {
          storeStatus: "delisted",
          delistedAt: new Date(),
        },
      });
      delisted++;
    }
  }

  return NextResponse.json({
    success: true,
    matched,
    unmatched,
    delisted,
    unmatchedNames: unmatchedNames.slice(0, 20),
  });
}
