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
  // Fail closed if CRON_SECRET is missing — never expose this endpoint publicly.
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  // First pass: resolve matches and collect update operations
  const foundIds = new Set<string>();
  const availableUpdates: { id: string; storePrice?: number }[] = [];
  let unmatched = 0;
  const unmatchedNames: string[] = [];

  for (const { name, storePrice } of body.items) {
    if (!name) continue;
    const item = byName.get(name.toLowerCase()) ?? byMarketId.get(name.toLowerCase());
    if (item) {
      foundIds.add(item.id);
      availableUpdates.push({ id: item.id, storePrice });
    } else {
      unmatched++;
      unmatchedNames.push(name);
    }
  }

  // Defense-in-depth: a healthy store scrape always matches at least some
  // items we already track. Zero matches means the scrape was blocked, hit
  // the Steam login wall, or sbox.game changed its layout — NOT that the
  // entire store emptied overnight. Delisting on a zero-match run would flip
  // every currently-available item to "delisted" (mass data corruption), so
  // we only delist when at least one scraped item matched. The sbox.dev API
  // sync (Item.isActiveStoreItem) is the source of truth for store rotation;
  // this scraper is a legacy fallback.
  const matched = availableUpdates.length;
  const safeToDelist = matched > 0;

  // Previously-available items not in the store this run are now delisted
  const now = new Date();
  const delistedIds = safeToDelist
    ? dbItems
        .filter((i) => i.storeStatus === "available" && !foundIds.has(i.id))
        .map((i) => i.id)
    : [];

  // Run all updates in parallel — single roundtrip per update instead of serial waits
  const availablePromises = availableUpdates.map((u) =>
    prisma.item.update({
      where: { id: u.id },
      data: {
        storeStatus: "available",
        delistedAt: null,
        ...(u.storePrice != null ? { storePrice: u.storePrice } : {}),
      },
    }),
  );
  const delistedPromises = delistedIds.map((id) =>
    prisma.item.update({
      where: { id },
      data: { storeStatus: "delisted", delistedAt: now },
    }),
  );
  await Promise.all([...availablePromises, ...delistedPromises]);

  const delisted = delistedIds.length;

  return NextResponse.json({
    success: true,
    matched,
    unmatched,
    delisted,
    delistSkipped: !safeToDelist,
    unmatchedNames: unmatchedNames.slice(0, 20),
  });
}
