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

interface UnpairedOrphan {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
}

interface UnpairedPhantom {
  id: string;
  name: string;
  slug: string;
  steamMarketId: string;
  currentPrice: number | null;
  volume: number | null;
  pricePointCount: number;
}

interface ScanResult {
  pairs: OrphanPair[];
  unpairedOrphans: UnpairedOrphan[];
  unpairedPhantoms: UnpairedPhantom[];
}

async function scan(): Promise<ScanResult> {
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
  const orphansByName = new Map<string, typeof orphans[number]>();
  for (const o of orphans) {
    orphansByName.set(o.name.toLowerCase(), o);
  }

  // Identify pairs (name-matched) and the unpaired residue on both
  // sides. The unpaired phantoms are the ones we'd want to inspect
  // for manual pairing — they have the live Steam data but no
  // matching sbox row by name (e.g. sbox.dev stored the item under
  // a quirky display name like "Toothpick" while Steam lists it as
  // "Cat Balaclava").
  const matchedPhantomIds = new Set<string>();
  const matchedOrphanIds = new Set<string>();

  // Single grouped count of price points across all phantom IDs —
  // used both for paired and unpaired phantom rendering.
  const phantomIds = phantoms.map((p) => p.id);
  const pricePointCounts =
    phantomIds.length > 0
      ? await prisma.pricePoint.groupBy({
          by: ["itemId"],
          where: { itemId: { in: phantomIds } },
          _count: { _all: true },
        })
      : [];
  const countByItem = new Map<string, number>(
    pricePointCounts.map((r) => [r.itemId, r._count._all as number]),
  );

  const pairs: OrphanPair[] = [];
  for (const o of orphans) {
    const p = phantomsByName.get(o.name.toLowerCase());
    if (!p || p.id === o.id) continue;
    matchedPhantomIds.add(p.id);
    matchedOrphanIds.add(o.id);
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

  const unpairedOrphans: UnpairedOrphan[] = orphans
    .filter((o) => !matchedOrphanIds.has(o.id))
    .map((o) => ({
      id: o.id,
      name: o.name,
      slug: o.slug,
      imageUrl: o.imageUrl,
    }));

  const unpairedPhantoms: UnpairedPhantom[] = phantoms
    .filter((p) => !matchedPhantomIds.has(p.id))
    .filter((p) => orphansByName.get(p.name.toLowerCase()) === undefined)
    .map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      steamMarketId: p.steamMarketId as string,
      currentPrice: p.currentPrice,
      volume: p.volume,
      pricePointCount: countByItem.get(p.id) ?? 0,
    }));

  return { pairs, unpairedOrphans, unpairedPhantoms };
}

/**
 * Fold one phantom row into one orphan row inside a transaction.
 * Re-points PricePoints, deletes the phantom (frees its
 * steamMarketId from the @unique constraint), then copies the
 * Steam-side fields onto the orphan. Order matters: if we updated
 * the orphan before deleting the phantom, the orphan's UPDATE
 * would fail with a unique violation on steamMarketId because the
 * phantom still owns the value.
 */
async function mergePair(
  orphanId: string,
  phantom: {
    id: string;
    steamMarketId: string;
    currentPrice: number | null;
    volume: number | null;
    imageUrl: string | null;
  },
  orphan: { imageUrl: string | null },
): Promise<{ pricePointsMoved: number }> {
  return prisma.$transaction(async (tx) => {
    // 1. Move price history off the phantom so it survives the delete.
    const ppMove = await tx.pricePoint.updateMany({
      where: { itemId: phantom.id },
      data: { itemId: orphanId },
    });
    // 2. Delete phantom — releases its hold on the unique
    //    steamMarketId. Any remaining FKs (PriceAlert with Cascade,
    //    TradeListItem with SetNull, etc.) resolve cleanly here.
    await tx.item.delete({ where: { id: phantom.id } });
    // 3. Now the orphan can claim the freed steamMarketId.
    await tx.item.update({
      where: { id: orphanId },
      data: {
        steamMarketId: phantom.steamMarketId,
        marketUrl: `https://steamcommunity.com/market/listings/590830/${encodeURIComponent(
          phantom.steamMarketId,
        )}`,
        currentPrice: phantom.currentPrice,
        volume: phantom.volume,
        imageUrl: phantom.imageUrl ?? orphan.imageUrl,
      },
    });
    return { pricePointsMoved: ppMove.count };
  });
}

async function runManualMerge(orphanId: string, phantomId: string) {
  if (orphanId === phantomId) {
    return NextResponse.json(
      { error: "orphanId and phantomId must differ" },
      { status: 400 },
    );
  }
  const [orphan, phantom] = await Promise.all([
    prisma.item.findUnique({
      where: { id: orphanId },
      select: { id: true, name: true, steamMarketId: true, imageUrl: true },
    }),
    prisma.item.findUnique({
      where: { id: phantomId },
      select: {
        id: true,
        name: true,
        steamMarketId: true,
        currentPrice: true,
        volume: true,
        imageUrl: true,
      },
    }),
  ]);
  if (!orphan || !phantom) {
    return NextResponse.json(
      { error: "orphan or phantom not found by id" },
      { status: 404 },
    );
  }
  if (orphan.steamMarketId !== null) {
    return NextResponse.json(
      {
        error:
          "orphan already has a steamMarketId — refusing to merge into a non-orphan row",
      },
      { status: 400 },
    );
  }
  if (phantom.steamMarketId === null) {
    return NextResponse.json(
      {
        error:
          "phantom has no steamMarketId — there's nothing to fold in. Did you swap the IDs?",
      },
      { status: 400 },
    );
  }
  try {
    const result = await mergePair(
      orphan.id,
      {
        id: phantom.id,
        steamMarketId: phantom.steamMarketId,
        currentPrice: phantom.currentPrice,
        volume: phantom.volume,
        imageUrl: phantom.imageUrl,
      },
      { imageUrl: orphan.imageUrl },
    );
    return NextResponse.json({
      success: true,
      merged: 1,
      pairs: [
        {
          name: orphan.name,
          keptId: orphan.id,
          deletedId: phantom.id,
          pricePointsMoved: result.pricePointsMoved,
        },
      ],
      errors: [],
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        merged: 0,
        errors: [
          `manual merge ${orphan.name} ↔ ${phantom.name}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        ],
      },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  const guard = await guardAdminRoute(request, {
    allowedKeys: ["cron", "analytics"],
  });
  if (!guard.ok) return guard.response;

  const { pairs, unpairedOrphans, unpairedPhantoms } = await scan();
  return NextResponse.json({
    pairCount: pairs.length,
    pairs,
    unpairedOrphans,
    unpairedPhantoms,
    hint:
      pairs.length === 0
        ? unpairedOrphans.length > 0 || unpairedPhantoms.length > 0
          ? "No name-matched pairs. Some unpaired rows exist — POST { orphanId, phantomId } to merge a specific pair manually."
          : "Catalog is clean — no orphan or phantom rows."
        : "POST with no body to fold every name-matched pair, or POST { orphanId, phantomId } to merge a specific pair.",
  });
}

export async function POST(request: NextRequest) {
  const guard = await guardAdminRoute(request, {
    allowedKeys: ["cron", "analytics"],
  });
  if (!guard.ok) return guard.response;

  // Optional explicit pair body. When provided, do exactly that
  // one merge regardless of whether the names match — useful for
  // items whose sbox.dev display name diverges from the Steam
  // hash_name (e.g. Cat Balaclava under sbox slug "toothpick").
  let body: { orphanId?: string; phantomId?: string } = {};
  try {
    if (request.headers.get("content-length") !== "0") {
      body = (await request.json().catch(() => ({}))) as typeof body;
    }
  } catch {
    body = {};
  }

  if (body.orphanId && body.phantomId) {
    return await runManualMerge(body.orphanId, body.phantomId);
  }

  const { pairs } = await scan();
  if (pairs.length === 0) {
    return NextResponse.json({
      success: true,
      merged: 0,
      message: "No name-matched pairs to merge.",
    });
  }

  const merged: { name: string; keptId: string; deletedId: string; pricePointsMoved: number }[] = [];
  const errors: string[] = [];

  for (const pair of pairs) {
    try {
      const result = await mergePair(
        pair.orphan.id,
        {
          id: pair.phantom.id,
          steamMarketId: pair.phantom.steamMarketId,
          currentPrice: pair.phantom.currentPrice,
          volume: pair.phantom.volume,
          imageUrl: pair.phantom.imageUrl,
        },
        { imageUrl: pair.orphan.imageUrl },
      );

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
