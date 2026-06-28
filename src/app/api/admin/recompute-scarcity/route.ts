import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guardAdminRoute } from "@/lib/auth/admin-guard";
import { computeScarcityScore } from "@/lib/services/sync-service";
import { invalidatePattern } from "@/lib/redis/cache";

/**
 * POST /api/admin/recompute-scarcity
 *
 * One-off (and re-runnable) recompute of `scarcityScore` for every item from
 * the supply/owner/market fields already stored on each row — no upstream
 * fetch. Use after changing the scoring formula so stored scores update
 * immediately instead of waiting for the enrichment cron to cycle every item.
 *
 * Pure read of existing columns → recompute → write only the rows whose score
 * actually changed (keeps the write count, and Neon compute, minimal).
 *
 * Auth: ANALYTICS_KEY or CRON_SECRET (guardAdminRoute).
 */
export async function POST(request: NextRequest) {
  const guard = await guardAdminRoute(request, {
    allowedKeys: ["analytics", "cron"],
  });
  if (!guard.ok) return guard.response;

  const items = await prisma.item.findMany({
    select: {
      id: true,
      slug: true,
      scarcityScore: true,
      totalSupply: true,
      uniqueOwners: true,
      supplyOnMarket: true,
      soldPast24h: true,
      currentPrice: true,
      priceChange24h: true,
    },
  });

  let changed = 0;
  const sample: { slug: string; from: number | null; to: number }[] = [];

  for (const it of items) {
    const next = computeScarcityScore({
      totalSupply: it.totalSupply,
      uniqueOwners: it.uniqueOwners,
      supplyOnMarket: it.supplyOnMarket,
      soldPast24h: it.soldPast24h,
      price: it.currentPrice,
      priceChange24hPercent: it.priceChange24h,
    });

    if (it.scarcityScore !== next) {
      await prisma.item.update({
        where: { id: it.id },
        data: { scarcityScore: next },
      });
      changed++;
      if (sample.length < 15) {
        sample.push({ slug: it.slug, from: it.scarcityScore, to: next });
      }
    }
  }

  if (changed > 0) {
    await invalidatePattern("items:*");
    await invalidatePattern("item:*");
  }

  return NextResponse.json({
    ok: true,
    scanned: items.length,
    changed,
    sample,
  });
}
