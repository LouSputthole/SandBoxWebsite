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
  // Fail closed if CRON_SECRET is missing — never expose this endpoint publicly.
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
  // Pre-compute normalized names once for substring strategy (avoids re-running
  // normalize() inside a nested loop on every incoming item)
  const dbNormCache = dbItems.map((dbItem) => ({
    item: dbItem,
    norm: normalize(dbItem.name),
  }));

  const unmatchedNames: string[] = [];
  const matchLog: { scraped: string; dbName: string; method: string }[] = [];
  // Collect pending updates so we can Promise.all them at the end
  const pendingUpdates: { id: string; supply: number }[] = [];

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

    // Strategy 5: Substring/contains match — uses the precomputed norm cache
    if (!item) {
      for (const { item: dbItem, norm: dbNorm } of dbNormCache) {
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
      pendingUpdates.push({ id: item.id, supply });
      matchLog.push({ scraped: name, dbName: item.name, method });
    } else {
      unmatchedNames.push(name);
    }
  }

  // Run all item updates in parallel
  await Promise.all(
    pendingUpdates.map((u) =>
      prisma.item.update({
        where: { id: u.id },
        data: { totalSupply: u.supply },
      }),
    ),
  );

  const matched = pendingUpdates.length;
  const unmatched = unmatchedNames.length;

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
