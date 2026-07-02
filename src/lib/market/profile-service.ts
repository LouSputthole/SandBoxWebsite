/**
 * Server-side loaders that feed the PURE {@link computeProfileStats} core. Kept out of profile-stats.ts
 * so the derivations stay DB-free + unit-tested; this file is the thin Prisma layer.
 */

import { prisma } from "@/lib/db";
import { computeProfileStats, type ProfileStats } from "./profile-stats";

/**
 * Load one user's full reputation profile: every order they were a party to (as buyer or seller) plus
 * every review they've received, run through the pure derivation. Aggregate rep is public by design
 * (the per-order privacy flags gate identity, not these tallies — see profile-stats.ts).
 */
export async function loadProfileStats(userId: string): Promise<ProfileStats> {
  const [orders, reviews] = await Promise.all([
    prisma.marketOrder.findMany({
      where: { OR: [{ buyerId: userId }, { sellerId: userId }] },
      select: {
        buyerId: true,
        sellerId: true,
        state: true,
        priceUsdc: true,
        fundedAt: true,
        sellerSentAt: true,
        deliveredAt: true,
      },
    }),
    prisma.marketReview.findMany({ where: { ratedId: userId }, select: { stars: true } }),
  ]);
  return computeProfileStats(userId, orders, reviews);
}

/** Compact seller reputation for a listing card / seller strip. */
export interface SellerRep {
  /** RELEASED sales by this seller. */
  completedSales: number;
  /** Number of reviews received. */
  reviewCount: number;
  /** Mean stars to 1 decimal — null when no reviews. */
  avgStars: number | null;
}

/**
 * Batch-load compact rep for many sellers in TWO groupBy queries (no N+1) — for the /market grid.
 * Sellers with no sales/reviews are simply absent from the map (callers treat that as "New seller").
 */
export async function loadSellerReps(sellerIds: readonly string[]): Promise<Map<string, SellerRep>> {
  const ids = [...new Set(sellerIds)];
  const map = new Map<string, SellerRep>();
  if (ids.length === 0) return map;

  const [sales, reviews] = await Promise.all([
    prisma.marketOrder.groupBy({
      by: ["sellerId"],
      where: { sellerId: { in: ids }, state: "RELEASED" },
      _count: { _all: true },
    }),
    prisma.marketReview.groupBy({
      by: ["ratedId"],
      where: { ratedId: { in: ids } },
      _count: { _all: true },
      _avg: { stars: true },
    }),
  ]);

  const ensure = (id: string): SellerRep => {
    let r = map.get(id);
    if (!r) {
      r = { completedSales: 0, reviewCount: 0, avgStars: null };
      map.set(id, r);
    }
    return r;
  };

  for (const s of sales) ensure(s.sellerId).completedSales = s._count._all;
  for (const rv of reviews) {
    const r = ensure(rv.ratedId);
    r.reviewCount = rv._count._all;
    r.avgStars = rv._avg.stars === null ? null : Math.round(rv._avg.stars * 10) / 10;
  }
  return map;
}
