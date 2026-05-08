import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guardAdminRoute } from "@/lib/auth/admin-guard";

/**
 * GET  /api/admin/merge-orphan-items   — preview pairs (read-only)
 * POST /api/admin/merge-orphan-items   — merge them
 *
 * Cleanup tool for the dupe-row situation that existed pre-PR #68:
 * sbox-discover seeded a row for a new store drop with
 * steamMarketId=null; when Steam Market later listed the same item,
 * the old upsertItem matched only by steamMarketId, missed the
 * existing row, and created a SECOND row keyed by slugify(hash_name).
 * Result: the original sbox row keeps the rich metadata + correct
 * slug but stays price-less; the phantom Steam row has the live
 * price + market URL but a slugified slug and no sbox info.
 *
 * This endpoint finds those pairs (case-insensitive name match,
 * one row with steamMarketId, one without) and folds the Steam row
 * INTO the sbox row:
 *   1. Copy steamMarketId, marketUrl, currentPrice, volume, image
 *      from phantom → orphan
 *   2. Re-point any PricePoint rows from phantom → orphan so the
 *      price history isn't lost when we delete the phantom
 *   3. Delete the phantom row (Cascade clears anything not migrated)
 *
 * Idempotent: running twice when no orphan/phantom pairs exist is
 * a no-op. Once PR #68 is deployed the bug stops creating new
 * dupes — this endpoint is for the existing damage only.
 *
 * Protected by CRON_SECRET / ANALYTICS_KEY admin guard.
 */

interface OrphanPair {
  name: string;
  orphan: {
    id: string;
    slug: string;
    currentPrice: number | null;
    imageUrl: string | null;
  };
  phantom: {
    id: string;
    slug: string;
    steamMarketId: string;
    currentPrice: number | null;
    volume: number | null;
    imageUrl: string | null;
    pricePointCount: number;
  };
}

async function findOrphanPairs(): Promise<OrphanPair[]> {
  // Pull the two halves separately and join in Node. ~80 items
  // total in our DB; this is microseconds either way and keeps the
  // SQL out of $queryRaw territory.
  const [orphans, phantoms] = await Promise.all([
    prisma.item.findMany({
      where: { steamMarketId: null },
      select: {
        id: true,
        name: true,
        slug: true,
        currentPrice: true,
        imageUrl: true,
      },
    }),
    prisma.item.findMany({
      where: { steamMarketId: { not: null } },
      select: {
        id: true,
        name: true,
        slug: true,
        steamMarketId: true,
        currentPrice: true,
        volume: true,
        imageUrl: true,
      },
    }),
  ]);

  const phantomsByName = new Map<string, typeof phantoms[number]>();
  for (const p of phantoms) {
    phantomsByName.set(p.name.toLowerCase(), p);
  }

  // For each orphan, look for a phantom with the same name.
  const pairs: OrphanPair[] = [];
  const orphanIdsWithPair = new Set<string>();
  const phantomIdsToCount: string[] = [];
  for (const o of orphans) {
    const p = phantomsByName.get(o.name.toLowerCase());
    if (!p) continue;
    if (p.id === o.id) continue; // sanity — shouldn't happen but be defensive
    orphanIdsWithPair.add(o.id);
    phantomIdsToCount.push(p.id);
  }

  // Single grouped count of price points across all phantom IDs.
  const pricePointCounts =
    phantomIdsToCount.length > 0
      ? await prisma.pricePoint.groupBy({
          by: ["itemId"],
          where: { itemId: { in: phantomIdsToCount } },
          _count: { _all: true },
        })
      : [];
  const countByItem = new Map<string, number>(
    pricePointCounts.map((r) => [r.itemId, r._count._all as number]),
  );

  for (const o of orphans) {
    if (!orphanIdsWithPair.has(o.id)) continue;
    const p = phantomsByName.get(o.name.toLowerCase());
    if (!p) continue;
    pairs.push({
      name: o.name,
      orphan: {
        id: o.id,
        slug: o.slug,
        currentPrice: o.currentPrice,
        imageUrl: o.imageUrl,
      },
      phantom: {
        id: p.id,
        slug: p.slug,
        steamMarketId: p.steamMarketId as string,
        currentPrice: p.currentPrice,
        volume: p.volume,
        imageUrl: p.imageUrl,
        pricePointCount: countByItem.get(p.id) ?? 0,
      },
    });
  }
  return pairs;
}

export async function GET(request: NextRequest) {
  const guard = await guardAdminRoute(request, {
    allowedKeys: ["cron", "analytics"],
  });
  if (!guard.ok) return guard.response;

  const pairs = await findOrphanPairs();
  return NextResponse.json({
    pairCount: pairs.length,
    pairs,
    hint:
      pairs.length === 0
        ? "No orphan/phantom pairs detected — nothing to merge."
        : "POST to this endpoint to fold each phantom into its orphan.",
  });
}

export async function POST(request: NextRequest) {
  const guard = await guardAdminRoute(request, {
    allowedKeys: ["cron", "analytics"],
  });
  if (!guard.ok) return guard.response;

  const pairs = await findOrphanPairs();
  if (pairs.length === 0) {
    return NextResponse.json({
      success: true,
      merged: 0,
      message: "No orphan/phantom pairs to merge.",
    });
  }

  const merged: { name: string; keptId: string; deletedId: string; pricePointsMoved: number }[] = [];
  const errors: string[] = [];

  for (const pair of pairs) {
    try {
      // Run the merge as a single transaction so a failure mid-way
      // doesn't leave us with half-migrated price history or an
      // updated orphan + still-existing phantom.
      const result = await prisma.$transaction(async (tx) => {
        // 1. Re-point price points from phantom → orphan.
        const ppMove = await tx.pricePoint.updateMany({
          where: { itemId: pair.phantom.id },
          data: { itemId: pair.orphan.id },
        });

        // 2. Copy Steam-side fields onto the orphan. Don't overwrite
        //    the orphan image if Steam's image is missing.
        await tx.item.update({
          where: { id: pair.orphan.id },
          data: {
            steamMarketId: pair.phantom.steamMarketId,
            marketUrl: `https://steamcommunity.com/market/listings/590830/${encodeURIComponent(
              pair.phantom.steamMarketId,
            )}`,
            currentPrice: pair.phantom.currentPrice,
            volume: pair.phantom.volume,
            imageUrl: pair.phantom.imageUrl ?? pair.orphan.imageUrl,
          },
        });

        // 3. Delete phantom. Cascade clears any straggler rows
        //    (PriceAlerts, etc.) that were attached to the phantom
        //    — these are unlikely for fresh items but we accept
        //    losing them rather than silently leaving FKs dangling.
        await tx.item.delete({ where: { id: pair.phantom.id } });

        return { pricePointsMoved: ppMove.count };
      });

      merged.push({
        name: pair.name,
        keptId: pair.orphan.id,
        deletedId: pair.phantom.id,
        pricePointsMoved: result.pricePointsMoved,
      });
    } catch (err) {
      errors.push(
        `merge ${pair.name}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return NextResponse.json({
    success: errors.length === 0,
    merged: merged.length,
    pairs: merged,
    errors,
  });
}
