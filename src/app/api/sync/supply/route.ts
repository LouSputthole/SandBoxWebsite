import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * Normalize a name for fuzzy matching:
 * lowercase, strip parenthetical suffixes, extra whitespace, special chars.
 */
function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s*\(.*?\)\s*/g, "") // strip (Trading), (Foil), etc.
    .replace(/[^a-z0-9\s]/g, "")   // strip special chars
    .replace(/\s+/g, " ")          // collapse whitespace
    .trim();
}

/**
 * POST /api/sync/supply
 *
 * Receives scraped supply data from the Playwright scraper and updates
 * totalSupply for matching items. Uses multiple matching strategies:
 * 1. Exact name match (case-insensitive)
 * 2. steamMarketId match
 * 3. Slug match
 * 4. Normalized fuzzy match (strips parentheticals and special chars)
 * 5. Substring/contains match (scraped name contained in DB name or vice versa)
 *
 * Body: { items: [{ name: string, supply: number }] }
 */
export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let body: { items?: { name: string; supply: number }[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.items || !Array.isArray(body.items)) {
    return NextResponse.json({ error: "Missing 'items' array" }, { status: 400 });
  }

  const dbItems = await prisma.item.findMany({
    select: { id: true, name: true, slug: true, steamMarketId: true },
  });

  // Build multiple lookup maps
  const byExactName = new Map(dbItems.map((i) => [i.name.toLowerCase(), i]));
  const byMarketId = new Map(
    dbItems.filter((i) => i.steamMarketId).map((i) => [i.steamMarketId!.toLowerCase(), i]),
  );
  const bySlug = new Map(dbItems.map((i) => [i.slug, i]));
  const byNormalized = new Map(dbItems.map((i) => [normalize(i.name), i]));

  let matched = 0;
  let unmatched = 0;
  const unmatchedNames: string[] = [];
  const matchLog: { scraped: string; dbName: string; method: string }[] = [];

  for (const { name, supply } of body.items) {
    if (!name || supply == null) continue;

    const lcName = name.toLowerCase();
    const normName = normalize(name);
    const slugName = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

    // Strategy 1: Exact name match
    let item = byExactName.get(lcName);
    let method = "exact";

    // Strategy 2: steamMarketId match
    if (!item) {
      item = byMarketId.get(lcName);
      method = "marketId";
    }

    // Strategy 3: Slug match
    if (!item) {
      item = bySlug.get(slugName);
      method = "slug";
    }

    // Strategy 4: Normalized match (strips parentheticals)
    if (!item) {
      item = byNormalized.get(normName);
      method = "normalized";
    }

    // Strategy 5: Substring/contains match
    if (!item) {
      // Check if scraped name is contained within any DB item name, or vice versa
      for (const dbItem of dbItems) {
        const dbNorm = normalize(dbItem.name);
        if (
          (normName.length >= 4 && dbNorm.includes(normName)) ||
          (dbNorm.length >= 4 && normName.includes(dbNorm))
        ) {
          item = dbItem;
          method = "substring";
          break;
        }
      }
    }

    if (item) {
      await prisma.item.update({
        where: { id: item.id },
        data: { totalSupply: supply },
      });
      matched++;
      matchLog.push({ scraped: name, dbName: item.name, method });
    } else {
      unmatched++;
      unmatchedNames.push(name);
    }
  }

  console.log(`[supply] Matched ${matched}, unmatched ${unmatched}`);
  for (const m of matchLog) {
    console.log(`[supply]   "${m.scraped}" -> "${m.dbName}" (${m.method})`);
  }
  if (unmatchedNames.length > 0) {
    console.log(`[supply] Unmatched: ${unmatchedNames.join(", ")}`);
  }

  return NextResponse.json({
    success: true,
    matched,
    unmatched,
    unmatchedNames: unmatchedNames.slice(0, 50),
    matchLog: matchLog.slice(0, 50),
  });
}
