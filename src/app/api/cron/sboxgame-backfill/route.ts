import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fetchSboxGameMetrics } from "@/lib/services/sync-service";

/**
 * GET/POST /api/cron/sboxgame-backfill
 *
 * Daily cron that fills in catalog data from sbox.game's metrics page
 * for items where sbox.dev returned sparse data. Conditions for a row
 * to be processed:
 *   - workshopId IS NOT NULL (we need the URL key)
 *   - any of totalSupply / uniqueOwners / currentPrice / imageUrl IS NULL
 *
 * Only writes to currently-null columns — never overwrites a value
 * sbox.dev already provided. Caps work per run so a single 300s
 * Vercel function can't get stranded mid-batch.
 *
 * CRON_SECRET-gated. Idempotent — running twice in a row is a no-op
 * for items already filled.
 */
export const maxDuration = 300;

const BATCH_SIZE = 60;

async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const items = await prisma.item.findMany({
    where: {
      workshopId: { not: null },
      OR: [
        { totalSupply: null },
        { uniqueOwners: null },
        { currentPrice: null },
        { imageUrl: null },
      ],
    },
    select: {
      id: true,
      workshopId: true,
      totalSupply: true,
      uniqueOwners: true,
      currentPrice: true,
      imageUrl: true,
    },
    take: BATCH_SIZE,
    orderBy: { sboxSyncedAt: { sort: "asc", nulls: "first" } },
  });

  let updated = 0;
  let fetched = 0;
  const errors: string[] = [];

  for (const it of items) {
    if (!it.workshopId) continue;
    fetched++;
    try {
      const m = await fetchSboxGameMetrics(it.workshopId);
      if (!m) continue;

      // Only fill columns that are currently null. We trust sbox.dev's
      // values when present — sbox.game scrape is a sparseness fix,
      // not a source-of-truth override.
      const data: Record<string, number | string> = {};
      if (it.totalSupply == null && typeof m.totalSupply === "number") {
        data.totalSupply = m.totalSupply;
      }
      if (it.uniqueOwners == null && typeof m.uniqueOwners === "number") {
        data.uniqueOwners = m.uniqueOwners;
      }
      if (it.currentPrice == null && typeof m.currentPrice === "number") {
        data.currentPrice = m.currentPrice;
      }
      if (it.imageUrl == null && typeof m.imageUrl === "string") {
        data.imageUrl = m.imageUrl;
      }

      if (Object.keys(data).length > 0) {
        await prisma.item.update({ where: { id: it.id }, data });
        updated++;
      }
    } catch (err) {
      errors.push(
        `${it.workshopId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    // Light jitter so we don't hammer sbox.game.
    await new Promise((r) => setTimeout(r, 75 + Math.random() * 75));
  }

  return NextResponse.json({
    ok: true,
    candidates: items.length,
    fetched,
    updated,
    errors,
    elapsedMs: Date.now() - startedAt,
  });
}

export const GET = handle;
export const POST = handle;
