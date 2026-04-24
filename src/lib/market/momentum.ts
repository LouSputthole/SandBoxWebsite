import { prisma } from "@/lib/db";

/**
 * Per-item momentum scoring — a 0–100 composite of a dozen independent
 * signals. Used by the Monday outlook newsletter to rank "what we think
 * will pop next week" and by the Friday report to highlight items with
 * strong underlying signals that haven't priced in yet.
 *
 * Why composite vs single-metric: any single indicator (e.g. 7-day % change)
 * is trivially gameable and noisy. A skin can spike 40% on one whale trade
 * and revert. By blending price action, volume, supply, sales velocity,
 * store status, and holder concentration, we get a signal that actually
 * needs broad agreement across the order book before lighting up.
 *
 * Each indicator produces a 0–100 sub-score. The composite is a weighted
 * average. Weights chosen so the signal doesn't collapse when one input
 * is missing (supply history, for example, only exists for items we've
 * snapshotted). Missing inputs drop out of both numerator AND denominator
 * — so an item with only 4 of 12 signals populated still gets a fair score.
 */

export interface MomentumSignals {
  /** 7d price change as a % (current vs median-of-window 7d ago). */
  priceChange7dPct?: number;
  /** 30d price change as a %. */
  priceChange30dPct?: number;
  /** Recent 6h change (from Item.priceChange6hPercent). */
  priceChange6hPct?: number;
  /** Short-term acceleration: 7d - 30d/4.3 (weekly-equivalent). Positive
   *  = trending up; negative = losing steam. */
  accelerationPct?: number;
  /** Volume surge: current volume / median-of-30d volume. 1 = neutral. */
  volumeSurgeX?: number;
  /** Sales velocity: soldPast24h / (totalSales/lifetime_days_estimate). */
  salesVelocityX?: number;
  /** Supply contraction %: change in supplyOnMarket over 7d (negative = contracting). */
  supplyChange7dPct?: number;
  /** Listing thinness: supplyOnMarket / uniqueOwners (lower = more hoarding). */
  listingThinness?: number;
  /** Scarcity score (raw 0–100 from Item.scarcityScore). */
  scarcityScore?: number;
  /** Store status bonus: +1 if leaving store within 14 days, 0 otherwise. */
  imminentDelisting?: number;
  /** Days since release — recency. Newer items (<30d) get a freshness bonus. */
  daysSinceRelease?: number;
  /** Holder concentration: top-1-holder share of total supply (0–1). Higher
   *  = scarcer in float; few can move the price. */
  topHolderConcentration?: number;
}

export interface ScoredItem {
  itemId: string;
  name: string;
  slug: string;
  currentPrice: number | null;
  momentumScore: number;
  signals: MomentumSignals;
  /** Plain-English summary of the top 2–3 signals driving the score,
   *  for newsletter "why we're watching this" callouts. */
  rationale: string[];
}

// Weights intentionally sum to >1 so missing signals degrade gracefully
// via normalized denominator. Core price/volume signals dominate.
const WEIGHTS: Record<keyof MomentumSignals, number> = {
  priceChange7dPct: 0.18,
  priceChange30dPct: 0.10,
  priceChange6hPct: 0.05,
  accelerationPct: 0.12,
  volumeSurgeX: 0.12,
  salesVelocityX: 0.08,
  supplyChange7dPct: 0.10,
  listingThinness: 0.06,
  scarcityScore: 0.08,
  imminentDelisting: 0.05,
  daysSinceRelease: 0.03,
  topHolderConcentration: 0.03,
};

// Map each raw signal into a 0–100 score. Each function is intentionally
// simple so we can eyeball why an item rated high — opaque scoring is a
// red flag when the output gets published in a newsletter.
function sub(signal: keyof MomentumSignals, raw: number): number {
  const clamp = (x: number) => Math.max(0, Math.min(100, x));
  switch (signal) {
    case "priceChange7dPct":
      // +20% = 80, 0% = 50, -20% = 20. Saturates beyond ±50%.
      return clamp(50 + raw * 1.5);
    case "priceChange30dPct":
      return clamp(50 + raw * 0.8);
    case "priceChange6hPct":
      // 6h moves are noisier — weaker scoring curve.
      return clamp(50 + raw * 2.5);
    case "accelerationPct":
      return clamp(50 + raw * 2);
    case "volumeSurgeX":
      // 1x = 50 (baseline), 3x = 90, 5x+ = 100.
      return clamp(25 + raw * 15);
    case "salesVelocityX":
      return clamp(25 + raw * 15);
    case "supplyChange7dPct":
      // Contracting supply is bullish. -20% supply = 85, 0% = 50.
      return clamp(50 - raw * 1.75);
    case "listingThinness":
      // thinness = supplyOnMarket / uniqueOwners. <0.1 (10% of owners
      // have listed) = thin/bullish.
      return clamp(100 - raw * 200);
    case "scarcityScore":
      return clamp(raw);
    case "imminentDelisting":
      return raw > 0 ? 95 : 50;
    case "daysSinceRelease":
      // Fresh releases <14d score high (hype window); >90d is neutral.
      if (raw < 14) return 80;
      if (raw < 30) return 65;
      return 50;
    case "topHolderConcentration":
      // 0.3+ top-1 share is very concentrated → high score.
      return clamp(raw * 300);
  }
}

export function computeMomentumScore(signals: MomentumSignals): number {
  let sum = 0;
  let weightUsed = 0;
  for (const [key, value] of Object.entries(signals) as Array<
    [keyof MomentumSignals, number | undefined]
  >) {
    if (value == null || !Number.isFinite(value)) continue;
    const weight = WEIGHTS[key];
    sum += sub(key, value) * weight;
    weightUsed += weight;
  }
  if (weightUsed === 0) return 0;
  return Math.round((sum / weightUsed) * 10) / 10;
}

/**
 * Plain-English summary of the 2-3 most influential signals. Helps Claude
 * (and the human reader) see WHY we flagged an item without decoding
 * the composite score.
 */
function buildRationale(signals: MomentumSignals): string[] {
  const lines: string[] = [];
  const { priceChange7dPct, volumeSurgeX, supplyChange7dPct, accelerationPct,
    scarcityScore, imminentDelisting, topHolderConcentration, salesVelocityX } = signals;

  if (priceChange7dPct != null && Math.abs(priceChange7dPct) >= 8) {
    lines.push(
      priceChange7dPct > 0
        ? `Up ${priceChange7dPct.toFixed(1)}% over 7 days`
        : `Down ${Math.abs(priceChange7dPct).toFixed(1)}% over 7 days`,
    );
  }
  if (volumeSurgeX != null && volumeSurgeX >= 1.75) {
    lines.push(`Volume ${volumeSurgeX.toFixed(1)}× its 30-day baseline`);
  }
  if (supplyChange7dPct != null && supplyChange7dPct <= -5) {
    lines.push(`Market supply contracted ${Math.abs(supplyChange7dPct).toFixed(1)}% this week`);
  }
  if (accelerationPct != null && accelerationPct >= 5) {
    lines.push("Trend is accelerating, not just drifting");
  }
  if (imminentDelisting) {
    lines.push("Leaving the store within 14 days");
  }
  if (scarcityScore != null && scarcityScore >= 70) {
    lines.push(`Scarcity score ${scarcityScore.toFixed(0)}/100`);
  }
  if (topHolderConcentration != null && topHolderConcentration >= 0.25) {
    lines.push(`Top holder owns ${(topHolderConcentration * 100).toFixed(0)}% of supply`);
  }
  if (salesVelocityX != null && salesVelocityX >= 1.5) {
    lines.push("Sales velocity well above its lifetime average");
  }

  return lines.slice(0, 3);
}

/**
 * Pull everything needed to score every tracked item in one DB round
 * trip, compute scores, and return sorted high → low. Does a second
 * query for 30-day price history (per-item) — that one's unavoidable
 * because we need the series, not an aggregate.
 */
export async function scoreAllItems(): Promise<ScoredItem[]> {
  const now = new Date();
  const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const d14 = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const items = await prisma.item.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      currentPrice: true,
      priceChange24h: true,
      priceChange6hPercent: true,
      volume: true,
      totalSales: true,
      soldPast24h: true,
      supplyOnMarket: true,
      totalSupply: true,
      uniqueOwners: true,
      scarcityScore: true,
      releaseDate: true,
      isActiveStoreItem: true,
      leavingStoreAt: true,
      topHolders: true,
    },
  });

  // Per-item price history in a 30d window. Get every point once — avoids
  // N queries. We'll split into 7d/30d baselines in memory.
  const pricePoints = await prisma.pricePoint.findMany({
    where: { timestamp: { gte: d30 } },
    select: { itemId: true, price: true, timestamp: true, volume: true },
  });

  const pointsByItem = new Map<string, typeof pricePoints>();
  for (const p of pricePoints) {
    const arr = pointsByItem.get(p.itemId);
    if (arr) arr.push(p);
    else pointsByItem.set(p.itemId, [p]);
  }

  // Supply snapshots for 7-day supply contraction signal.
  const supplySnaps = await prisma.supplySnapshot.findMany({
    where: { timestamp: { gte: d14 } },
    select: { itemId: true, totalSupply: true, timestamp: true },
    orderBy: { timestamp: "asc" },
  });
  const snapsByItem = new Map<string, typeof supplySnaps>();
  for (const s of supplySnaps) {
    const arr = snapsByItem.get(s.itemId);
    if (arr) arr.push(s);
    else snapsByItem.set(s.itemId, [s]);
  }

  const scored: ScoredItem[] = [];

  for (const item of items) {
    const signals: MomentumSignals = {};
    const itemPoints = pointsByItem.get(item.id) ?? [];

    // Price change signals via median of ±12h window (robust to outlier
    // single-point spikes — same rationale as the Friday report baseline).
    const medianAt = (target: Date, toleranceHours = 12): number | null => {
      const tol = toleranceHours * 60 * 60 * 1000;
      const nearby = itemPoints
        .filter(
          (p) =>
            Math.abs(p.timestamp.getTime() - target.getTime()) <= tol,
        )
        .map((p) => p.price)
        .sort((a, b) => a - b);
      if (nearby.length === 0) return null;
      return nearby[Math.floor(nearby.length / 2)];
    };

    const cur = item.currentPrice ?? null;
    const p7 = medianAt(d7);
    const p30 = medianAt(d30, 24); // wider window at 30d — data may be sparse
    if (cur != null && p7 != null && p7 > 0) {
      signals.priceChange7dPct = ((cur - p7) / p7) * 100;
    }
    if (cur != null && p30 != null && p30 > 0) {
      signals.priceChange30dPct = ((cur - p30) / p30) * 100;
    }
    if (item.priceChange6hPercent != null) {
      signals.priceChange6hPct = item.priceChange6hPercent;
    }

    // Acceleration: is the 7d trend faster than the 30d trend's weekly pace?
    if (signals.priceChange7dPct != null && signals.priceChange30dPct != null) {
      signals.accelerationPct =
        signals.priceChange7dPct - signals.priceChange30dPct / 4.3;
    }

    // Volume surge — current vs 30d median of PricePoint.volume snapshots.
    const volumes = itemPoints
      .map((p) => p.volume ?? 0)
      .filter((v) => v > 0);
    if (volumes.length >= 3 && item.volume != null && item.volume > 0) {
      const sorted = [...volumes].sort((a, b) => a - b);
      const medVol = sorted[Math.floor(sorted.length / 2)];
      if (medVol > 0) signals.volumeSurgeX = item.volume / medVol;
    }

    // Sales velocity — crude estimate using release date as lifetime proxy.
    if (
      item.soldPast24h != null && item.soldPast24h > 0 &&
      item.totalSales != null && item.totalSales > 0 && item.releaseDate
    ) {
      const ageDays = Math.max(
        1,
        (now.getTime() - item.releaseDate.getTime()) / (24 * 60 * 60 * 1000),
      );
      const avgDaily = item.totalSales / ageDays;
      if (avgDaily > 0) signals.salesVelocityX = item.soldPast24h / avgDaily;
    }

    // Supply contraction — need 2+ snapshots.
    const snaps = snapsByItem.get(item.id) ?? [];
    if (snaps.length >= 2) {
      const first = snaps[0];
      const last = snaps[snaps.length - 1];
      if (first.totalSupply > 0) {
        signals.supplyChange7dPct =
          ((last.totalSupply - first.totalSupply) / first.totalSupply) * 100;
      }
    }

    // Listing thinness.
    if (item.supplyOnMarket != null && item.uniqueOwners != null && item.uniqueOwners > 0) {
      signals.listingThinness = item.supplyOnMarket / item.uniqueOwners;
    }

    if (item.scarcityScore != null) signals.scarcityScore = item.scarcityScore;

    // Imminent delisting — store item with a leave date in next 14d.
    if (item.isActiveStoreItem && item.leavingStoreAt) {
      const daysUntil =
        (item.leavingStoreAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000);
      signals.imminentDelisting = daysUntil > 0 && daysUntil <= 14 ? 1 : 0;
    }

    // Days since release.
    if (item.releaseDate) {
      signals.daysSinceRelease =
        (now.getTime() - item.releaseDate.getTime()) / (24 * 60 * 60 * 1000);
    }

    // Top-holder concentration — from topHolders JSON if present.
    if (item.topHolders && item.totalSupply && item.totalSupply > 0) {
      try {
        const holders = item.topHolders as unknown as Array<{
          count?: number;
          amount?: number;
        }>;
        if (Array.isArray(holders) && holders.length > 0) {
          const topCount = holders[0]?.count ?? holders[0]?.amount ?? 0;
          if (topCount > 0) {
            signals.topHolderConcentration = topCount / item.totalSupply;
          }
        }
      } catch {
        // topHolders has free-form JSON historically — swallow parse issues.
      }
    }

    const score = computeMomentumScore(signals);
    scored.push({
      itemId: item.id,
      name: item.name,
      slug: item.slug,
      currentPrice: item.currentPrice ?? null,
      momentumScore: score,
      signals,
      rationale: buildRationale(signals),
    });
  }

  scored.sort((a, b) => b.momentumScore - a.momentumScore);
  return scored;
}
