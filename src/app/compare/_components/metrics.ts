import { rarityCssColor, rarityLabel } from "@/lib/rarity";

/**
 * Server-side data shaping for the Compare page.
 *
 * The Item model only stores a single `priceChange24h`. The 7d / 30d deltas
 * and the header sparkline are derived here from the item's `priceHistory`
 * (a 30-day window of PricePoint rows). When there isn't enough history to
 * anchor a period baseline, the derived value is `null` and the UI shows "—".
 */

export interface HistoryPoint {
  price: number;
  timestamp: Date;
}

/** A skin enriched with everything a comparison column needs to render. */
export interface ComparedItem {
  id: string;
  slug: string;
  name: string;
  type: string;
  imageUrl: string | null;
  currentPrice: number | null;
  priceChange24h: number | null;
  /** Derived from price history; null when the window is too sparse. */
  change7d: number | null;
  change30d: number | null;
  totalSupply: number | null;
  uniqueOwners: number | null;
  /** Units bought/sold in the last 24h (from sbox.dev). */
  soldPast24h: number | null;
  supplyOnMarket: number | null;
  scarcityScore: number | null;
  category: string | null;
  /** Human rarity tier (Common/Rare/…) or null when ungraded. */
  rarityName: string | null;
  /** Resolved #rrggbb rarity tint or null. */
  rarityTint: string | null;
  /** First release date or null when unknown. */
  releaseDate: Date | null;
  /** Whether the skin is currently purchasable in the S&box store. */
  isActiveStoreItem: boolean;
  /** Price series (price > 0, time order, down-sampled) for the sparkline. */
  spark: number[];
}

/** Raw shape pulled from Prisma (scalars we read + the history relation). */
export interface RawCompareItem {
  id: string;
  slug: string;
  name: string;
  type: string;
  imageUrl: string | null;
  currentPrice: number | null;
  priceChange24h: number | null;
  totalSupply: number | null;
  uniqueOwners: number | null;
  soldPast24h: number | null;
  supplyOnMarket: number | null;
  scarcityScore: number | null;
  category: string | null;
  rarity: string | null;
  rarityColor: string | null;
  releaseDate: Date | null;
  isActiveStoreItem: boolean;
  priceHistory: HistoryPoint[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

function capitalize(s: string | null | undefined): string | null {
  if (!s) return null;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Median price within a tolerance window around a target timestamp. Median
 * (not the nearest single point) so one outlier spike can't distort a period
 * baseline — same robustness rationale as the momentum scorer.
 */
function medianNear(
  points: HistoryPoint[],
  targetMs: number,
  toleranceHours: number,
): number | null {
  const tol = toleranceHours * 60 * 60 * 1000;
  const nearby = points
    .filter((p) => Math.abs(p.timestamp.getTime() - targetMs) <= tol)
    .map((p) => p.price)
    .sort((a, b) => a - b);
  if (nearby.length === 0) return null;
  return nearby[Math.floor(nearby.length / 2)];
}

/** % change of `current` vs the price `days` ago. null when unanchored. */
function periodChangePct(
  history: HistoryPoint[],
  current: number | null,
  days: number,
): number | null {
  if (current == null) return null;
  const target = Date.now() - days * DAY_MS;
  // Wider tolerance at 30d — history is often sparser that far back.
  const past = medianNear(history, target, days >= 30 ? 24 : 12);
  if (past == null || past <= 0) return null;
  return ((current - past) / past) * 100;
}

/** Evenly down-sample a series to at most `max` points (keeps endpoints). */
function downsample(series: number[], max: number): number[] {
  if (series.length <= max) return series;
  const step = (series.length - 1) / (max - 1);
  const out: number[] = [];
  for (let i = 0; i < max; i++) out.push(series[Math.round(i * step)]);
  return out;
}

export function toComparedItem(item: RawCompareItem): ComparedItem {
  // Drop placeholder/zero points — they're synced gaps, not real prices.
  const real = item.priceHistory.filter((p) => p.price > 0);
  return {
    id: item.id,
    slug: item.slug,
    name: item.name,
    type: item.type,
    imageUrl: item.imageUrl,
    currentPrice: item.currentPrice,
    priceChange24h: item.priceChange24h,
    change7d: periodChangePct(real, item.currentPrice, 7),
    change30d: periodChangePct(real, item.currentPrice, 30),
    totalSupply: item.totalSupply,
    uniqueOwners: item.uniqueOwners,
    soldPast24h: item.soldPast24h,
    supplyOnMarket: item.supplyOnMarket,
    scarcityScore: item.scarcityScore,
    category: item.category ?? capitalize(item.type),
    rarityName: rarityLabel(item.rarityColor) ?? capitalize(item.rarity),
    rarityTint: rarityCssColor(item.rarityColor),
    releaseDate: item.releaseDate,
    isActiveStoreItem: item.isActiveStoreItem,
    spark: downsample(
      real.map((p) => p.price),
      40,
    ),
  };
}
