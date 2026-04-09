import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * POST /api/sync/supply
 *
 * Receives scraped supply data from the Playwright scraper and updates
 * totalSupply for matching items. Matches by name (case-insensitive).
 *
 * Body: { items: [{ name: string, supply: number }] }
 */
export async function POST(request: NextRequest) {
  let body: { items?: { name: string; supply: number }[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.items || !Array.isArray(body.items)) {
    return NextResponse.json({ error: "Missing 'items' array" }, { status: 400 });
  }

  // Get all our items for matching
  const dbItems = await prisma.item.findMany({
    select: { id: true, name: true, steamMarketId: true },
  });

  // Build lookup maps (case-insensitive name and steamMarketId)
  const byName = new Map(dbItems.map((i) => [i.name.toLowerCase(), i]));
  const byMarketId = new Map(
    dbItems.filter((i) => i.steamMarketId).map((i) => [i.steamMarketId!.toLowerCase(), i])
  );

  let matched = 0;
  let unmatched = 0;
  const unmatchedNames: string[] = [];

  for (const { name, supply } of body.items) {
    if (!name || supply == null) continue;

    // Try exact name match, then steamMarketId match
    const item = byName.get(name.toLowerCase()) ?? byMarketId.get(name.toLowerCase());

    if (item) {
      await prisma.item.update({
        where: { id: item.id },
        data: { totalSupply: supply },
      });
      matched++;
    } else {
      unmatched++;
      unmatchedNames.push(name);
    }
  }

  return NextResponse.json({
    success: true,
    matched,
    unmatched,
    unmatchedNames: unmatchedNames.slice(0, 20), // Show first 20 for debugging
  });
}
