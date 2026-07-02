/**
 * PURE profile-stats derivations for CS2-marketplace-style public profiles (/market/u/[steamId]).
 *
 * Like accounting.ts, this module never touches the DB, the clock, or the network — it takes plain
 * MarketOrder-shaped rows (for ONE user, as buyer and/or seller) plus that user's received reviews
 * and produces the reputation numbers the profile renders. Everything is null-safe: an empty input
 * yields clean zeros / nulls so the UI can honestly show "—" / "No trades yet" and NEVER a fabricated
 * number.
 *
 * Rep is aggregate and public by design (mirrors CSFloat): the per-order buyerPublic/sellerPublic
 * flags gate a party's *identity* on the ledger, not these counts/averages — so a user who hid their
 * name on some trades still has those trades counted toward their completion rate and volume. No
 * identity is exposed here; only tallies. The identity-privacy rule lives in {@link selectVisibleTrades}.
 */

import { formatUsdc } from "./fees";

const ZERO = BigInt(0);

/** Terminal outcomes for a seller — the denominator of completion rate. */
const SELLER_TERMINAL: ReadonlySet<string> = new Set(["RELEASED", "REFUNDED", "DISPUTED"]);

/** The minimal MarketOrder shape the stats need. Narrower than the Prisma row so it stays testable. */
export interface ProfileStatsOrder {
  buyerId: string;
  sellerId: string;
  state: string;
  priceUsdc: bigint;
  fundedAt: Date | null;
  sellerSentAt: Date | null;
  deliveredAt: Date | null;
}

/** One received review — only the star value matters for the aggregate. */
export interface ProfileReviewStars {
  stars: number;
}

export interface SellerStats {
  /** RELEASED orders where this user was the seller. */
  completedSales: number;
  /** REFUNDED orders where this user was the seller. */
  refundedSales: number;
  /** DISPUTED orders where this user was the seller. */
  disputedCount: number;
  /** completedSales / (RELEASED + REFUNDED + DISPUTED), 0..1 — null when no terminal orders yet. */
  completionRate: number | null;
  /** Mean fundedAt→sellerSentAt in whole seconds (both present) — "time to accept". Null if none. */
  avgResponseSeconds: number | null;
  /** Mean fundedAt→deliveredAt in whole seconds (both present). Null if none. */
  avgDeliverySeconds: number | null;
  /** Sum of gross priceUsdc over RELEASED sales (USDC base units). */
  totalSalesVolume: bigint;
  /** totalSalesVolume as a human dollar string (e.g. "1250.00"). */
  totalSalesVolumeFormatted: string;
}

export interface BuyerStats {
  /** RELEASED orders where this user was the buyer. */
  completedPurchases: number;
  /** Sum of gross priceUsdc over RELEASED purchases (USDC base units). */
  purchaseVolume: bigint;
  /** purchaseVolume as a human dollar string. */
  purchaseVolumeFormatted: string;
}

export interface RatingStats {
  /** Number of reviews received. */
  count: number;
  /** Mean stars to 1 decimal place — null when there are no reviews. */
  average: number | null;
  /** Histogram indexed 0..4 for 1..5 stars respectively. */
  distribution: [number, number, number, number, number];
}

export interface ProfileStats {
  asSeller: SellerStats;
  asBuyer: BuyerStats;
  ratings: RatingStats;
}

/** Whole-second gap between two dates, or null if either is missing. */
function gapSeconds(from: Date | null, to: Date | null): number | null {
  if (!from || !to) return null;
  return (to.getTime() - from.getTime()) / 1000;
}

/** Mean of a list of numbers rounded to whole seconds, or null when empty. */
function meanSecondsOrNull(samples: number[]): number | null {
  if (samples.length === 0) return null;
  return Math.round(samples.reduce((a, b) => a + b, 0) / samples.length);
}

/**
 * Derive a user's full reputation profile from their orders (as buyer AND seller) plus the reviews
 * they've received. `userId` disambiguates which side of each order this user was on.
 */
export function computeProfileStats(
  userId: string,
  orders: readonly ProfileStatsOrder[],
  reviews: readonly ProfileReviewStars[],
): ProfileStats {
  let completedSales = 0;
  let refundedSales = 0;
  let disputedCount = 0;
  let sellerTerminal = 0;
  let totalSalesVolume = ZERO;

  let completedPurchases = 0;
  let purchaseVolume = ZERO;

  const responseSamples: number[] = [];
  const deliverySamples: number[] = [];

  for (const o of orders) {
    if (o.sellerId === userId) {
      if (SELLER_TERMINAL.has(o.state)) sellerTerminal += 1;
      if (o.state === "RELEASED") {
        completedSales += 1;
        totalSalesVolume += o.priceUsdc;
      } else if (o.state === "REFUNDED") {
        refundedSales += 1;
      } else if (o.state === "DISPUTED") {
        disputedCount += 1;
      }
      // Timing samples span all states where both stamps exist (a FUNDED-then-sent order still
      // reflects the seller's real responsiveness even before it settles).
      const resp = gapSeconds(o.fundedAt, o.sellerSentAt);
      if (resp !== null) responseSamples.push(resp);
      const deliv = gapSeconds(o.fundedAt, o.deliveredAt);
      if (deliv !== null) deliverySamples.push(deliv);
    }

    if (o.buyerId === userId && o.state === "RELEASED") {
      completedPurchases += 1;
      purchaseVolume += o.priceUsdc;
    }
  }

  const distribution: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  let starSum = 0;
  for (const r of reviews) {
    if (Number.isInteger(r.stars) && r.stars >= 1 && r.stars <= 5) {
      distribution[r.stars - 1] += 1;
      starSum += r.stars;
    }
  }
  const ratingCount = distribution.reduce((a, b) => a + b, 0);

  return {
    asSeller: {
      completedSales,
      refundedSales,
      disputedCount,
      completionRate: sellerTerminal > 0 ? completedSales / sellerTerminal : null,
      avgResponseSeconds: meanSecondsOrNull(responseSamples),
      avgDeliverySeconds: meanSecondsOrNull(deliverySamples),
      totalSalesVolume,
      totalSalesVolumeFormatted: formatUsdc(totalSalesVolume),
    },
    asBuyer: {
      completedPurchases,
      purchaseVolume,
      purchaseVolumeFormatted: formatUsdc(purchaseVolume),
    },
    ratings: {
      count: ratingCount,
      average: ratingCount > 0 ? Math.round((starSum / ratingCount) * 10) / 10 : null,
      distribution,
    },
  };
}

// ---------------------------------------------------------------------------
// Profile trade-list privacy rule (the public-page counterpart of the ledger's per-party redaction).
// ---------------------------------------------------------------------------

/** The privacy flags {@link selectVisibleTrades} needs from a completed order. */
export interface ProfileTradeFlags {
  buyerId: string;
  sellerId: string;
  buyerPublic: boolean;
  sellerPublic: boolean;
}

export interface VisibleTradesResult<T> {
  /** Orders to render, input order preserved. */
  visible: T[];
  /** How many of the input trades were withheld because the PROFILE OWNER marked themselves
   *  private on them. Surfaced honestly as "N hidden trades". */
  hiddenCount: number;
}

/**
 * Decide which of a profile owner's completed trades appear on their PUBLIC profile.
 *
 * The rule (documented + tested here because a subtle regression would de-anonymize someone):
 *  - The profile page inherently reveals the OWNER's identity (it's their page). So we respect their
 *    per-order choice by SKIPPING any trade where the owner set THEIR OWN flag to private
 *    (sellerPublic when they're the seller, buyerPublic when they're the buyer) — and counting it in
 *    `hiddenCount` so the page can say "N hidden trades" without exposing them.
 *  - For a shown trade, the COUNTERPARTY is still redacted per the counterparty's own flag — which is
 *    exactly what {@link toLedgerEntry} already does when the page maps the visible rows through it
 *    (the owner's flag is public for every shown trade, so the ledger renderer shows the owner and
 *    honors the counterparty's flag — including hiding the delivery Steam ids unless BOTH are public).
 *  - An order where the user is neither party (shouldn't happen — the query is scoped) is skipped and
 *    NOT counted as hidden.
 */
export function selectVisibleTrades<T extends ProfileTradeFlags>(
  orders: readonly T[],
  ownerUserId: string,
): VisibleTradesResult<T> {
  const visible: T[] = [];
  let hiddenCount = 0;
  for (const o of orders) {
    const isSeller = o.sellerId === ownerUserId;
    const isBuyer = o.buyerId === ownerUserId;
    if (!isSeller && !isBuyer) continue; // not the owner's trade — ignore entirely
    const ownerPublic = isSeller ? o.sellerPublic : o.buyerPublic;
    if (ownerPublic) visible.push(o);
    else hiddenCount += 1;
  }
  return { visible, hiddenCount };
}

/**
 * Humanize a duration in seconds to a compact two-unit string ("2h 14m", "3d 4h", "45s"). Pure, so
 * it's safe in a render body. Callers pass `null` through as "—" themselves.
 */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts: string[] = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (sec) parts.push(`${sec}s`);
  if (parts.length === 0) return "0s";
  return parts.slice(0, 2).join(" ");
}
