import { describe, it, expect } from "vitest";
import {
  computeProfileStats,
  selectVisibleTrades,
  formatDuration,
  type ProfileStatsOrder,
  type ProfileTradeFlags,
} from "./profile-stats";

// ---------------------------------------------------------------------------
// profile-stats is the PURE reputation core behind /market/u/[steamId]. These tests pin:
//   - the seller/buyer/rating derivations (and their null-safe empty behavior — never a fake number),
//   - the profile trade-list privacy rule (skip trades the OWNER hid; count them; keep the rest),
//   - duration humanizing.
// ---------------------------------------------------------------------------

const USDC = (n: number) => BigInt(n) * BigInt(1_000_000);
const D = (iso: string) => new Date(iso);
const SELLER = "user-seller";
const BUYER = "user-buyer";

/** Order with sane defaults where the subject is the SELLER; override what a test cares about. */
function order(over: Partial<ProfileStatsOrder>): ProfileStatsOrder {
  return {
    buyerId: "someone-else",
    sellerId: SELLER,
    state: "RELEASED",
    priceUsdc: USDC(100),
    fundedAt: null,
    sellerSentAt: null,
    deliveredAt: null,
    ...over,
  };
}

describe("computeProfileStats — seller side", () => {
  it("counts completed / refunded / disputed sales and completion rate over terminal orders", () => {
    const stats = computeProfileStats(
      SELLER,
      [
        order({ state: "RELEASED" }),
        order({ state: "RELEASED" }),
        order({ state: "RELEASED" }),
        order({ state: "REFUNDED" }),
        order({ state: "DISPUTED" }),
        // in-flight orders don't count toward the terminal denominator
        order({ state: "FUNDED" }),
        order({ state: "PROTECTION_HOLD" }),
      ],
      [],
    );
    expect(stats.asSeller.completedSales).toBe(3);
    expect(stats.asSeller.refundedSales).toBe(1);
    expect(stats.asSeller.disputedCount).toBe(1);
    // 3 released / (3 + 1 + 1) terminal = 0.6
    expect(stats.asSeller.completionRate).toBeCloseTo(0.6, 5);
  });

  it("sums total sales volume over RELEASED sales only", () => {
    const stats = computeProfileStats(
      SELLER,
      [
        order({ state: "RELEASED", priceUsdc: USDC(50) }),
        order({ state: "RELEASED", priceUsdc: USDC(25) }),
        order({ state: "REFUNDED", priceUsdc: USDC(999) }), // excluded
        order({ state: "FUNDED", priceUsdc: USDC(999) }), // excluded
      ],
      [],
    );
    expect(stats.asSeller.totalSalesVolume).toBe(USDC(75));
    expect(stats.asSeller.totalSalesVolumeFormatted).toBe("75.00");
  });

  it("averages response (funded→sent) and delivery (funded→delivered) times, null-safe on missing stamps", () => {
    const stats = computeProfileStats(
      SELLER,
      [
        order({
          state: "RELEASED",
          fundedAt: D("2026-07-01T10:00:00Z"),
          sellerSentAt: D("2026-07-01T10:30:00Z"), // 1800s
          deliveredAt: D("2026-07-01T12:14:00Z"), // 8040s
        }),
        order({
          state: "RELEASED",
          fundedAt: D("2026-07-02T10:00:00Z"),
          sellerSentAt: D("2026-07-02T11:30:00Z"), // 5400s
          deliveredAt: null, // no delivery sample
        }),
        // no fundedAt → contributes to neither average
        order({ state: "FUNDED", fundedAt: null, sellerSentAt: D("2026-07-03T10:00:00Z") }),
      ],
      [],
    );
    expect(stats.asSeller.avgResponseSeconds).toBe(Math.round((1800 + 5400) / 2)); // 3600
    expect(stats.asSeller.avgDeliverySeconds).toBe(8040);
  });

  it("only attributes seller orders to the subject (ignores orders where they were the buyer)", () => {
    const stats = computeProfileStats(
      SELLER,
      [
        order({ state: "RELEASED", sellerId: SELLER, buyerId: "x" }),
        // subject is the BUYER here — must not count as a sale
        order({ state: "RELEASED", sellerId: "other", buyerId: SELLER, priceUsdc: USDC(500) }),
      ],
      [],
    );
    expect(stats.asSeller.completedSales).toBe(1);
    expect(stats.asSeller.totalSalesVolume).toBe(USDC(100));
  });
});

describe("computeProfileStats — buyer side", () => {
  it("counts completed purchases and purchase volume over RELEASED buyer orders", () => {
    const stats = computeProfileStats(
      BUYER,
      [
        order({ state: "RELEASED", buyerId: BUYER, sellerId: "s1", priceUsdc: USDC(40) }),
        order({ state: "RELEASED", buyerId: BUYER, sellerId: "s2", priceUsdc: USDC(60) }),
        order({ state: "REFUNDED", buyerId: BUYER, sellerId: "s3", priceUsdc: USDC(999) }), // excluded
      ],
      [],
    );
    expect(stats.asBuyer.completedPurchases).toBe(2);
    expect(stats.asBuyer.purchaseVolume).toBe(USDC(100));
    expect(stats.asBuyer.purchaseVolumeFormatted).toBe("100.00");
  });
});

describe("computeProfileStats — ratings", () => {
  it("averages to one decimal and builds a 1..5 distribution", () => {
    const stats = computeProfileStats(
      SELLER,
      [],
      [{ stars: 5 }, { stars: 5 }, { stars: 4 }, { stars: 2 }],
    );
    expect(stats.ratings.count).toBe(4);
    expect(stats.ratings.average).toBe(4); // (5+5+4+2)/4 = 4.0
    expect(stats.ratings.distribution).toEqual([0, 1, 0, 1, 2]);
  });

  it("rounds the average to a single decimal place", () => {
    const stats = computeProfileStats(SELLER, [], [{ stars: 5 }, { stars: 4 }, { stars: 4 }]);
    expect(stats.ratings.average).toBe(4.3); // 13/3 = 4.333 → 4.3
  });

  it("ignores out-of-range / non-integer stars defensively", () => {
    const stats = computeProfileStats(SELLER, [], [{ stars: 5 }, { stars: 0 }, { stars: 6 }, { stars: 3.5 }]);
    expect(stats.ratings.count).toBe(1);
    expect(stats.ratings.distribution).toEqual([0, 0, 0, 0, 1]);
  });
});

describe("computeProfileStats — empty set is honest zeros/nulls, never fabricated", () => {
  it("returns clean zeros and nulls for a user with no orders or reviews", () => {
    const stats = computeProfileStats("nobody", [], []);
    expect(stats.asSeller).toMatchObject({
      completedSales: 0,
      refundedSales: 0,
      disputedCount: 0,
      completionRate: null,
      avgResponseSeconds: null,
      avgDeliverySeconds: null,
      totalSalesVolume: BigInt(0),
      totalSalesVolumeFormatted: "0.00",
    });
    expect(stats.asBuyer).toMatchObject({ completedPurchases: 0, purchaseVolume: BigInt(0) });
    expect(stats.ratings).toEqual({ count: 0, average: null, distribution: [0, 0, 0, 0, 0] });
  });
});

// ---------------------------------------------------------------------------
// The profile trade-list privacy rule.
// ---------------------------------------------------------------------------

function flags(over: Partial<ProfileTradeFlags> & { id: string }): ProfileTradeFlags & { id: string } {
  return { buyerId: BUYER, sellerId: SELLER, buyerPublic: true, sellerPublic: true, ...over };
}

describe("selectVisibleTrades — profile trade-list privacy", () => {
  it("shows a trade when the OWNER's own flag is public (as seller)", () => {
    const res = selectVisibleTrades([flags({ id: "a", sellerPublic: true })], SELLER);
    expect(res.visible.map((o) => o.id)).toEqual(["a"]);
    expect(res.hiddenCount).toBe(0);
  });

  it("hides + counts a trade when the OWNER (seller) marked themselves private on it", () => {
    const res = selectVisibleTrades(
      [flags({ id: "a", sellerPublic: false }), flags({ id: "b", sellerPublic: true })],
      SELLER,
    );
    expect(res.visible.map((o) => o.id)).toEqual(["b"]);
    expect(res.hiddenCount).toBe(1);
  });

  it("uses the BUYER flag when the owner is the buyer on that order", () => {
    const res = selectVisibleTrades(
      [
        // owner is the buyer here; their buyer flag is private → hidden regardless of sellerPublic
        flags({ id: "a", buyerId: BUYER, sellerId: "s", buyerPublic: false, sellerPublic: true }),
        flags({ id: "b", buyerId: BUYER, sellerId: "s", buyerPublic: true, sellerPublic: false }),
      ],
      BUYER,
    );
    expect(res.visible.map((o) => o.id)).toEqual(["b"]);
    expect(res.hiddenCount).toBe(1);
  });

  it("a counterparty's private flag does NOT hide the owner's trade (only redacts the counterparty later)", () => {
    // Owner is seller and public; counterparty (buyer) is private. Trade still shows on the owner's
    // profile — toLedgerEntry redacts the buyer, but the row is present.
    const res = selectVisibleTrades([flags({ id: "a", sellerPublic: true, buyerPublic: false })], SELLER);
    expect(res.visible.map((o) => o.id)).toEqual(["a"]);
    expect(res.hiddenCount).toBe(0);
  });

  it("ignores (does not count) orders where the user is neither party", () => {
    const res = selectVisibleTrades([flags({ id: "a", buyerId: "x", sellerId: "y" })], SELLER);
    expect(res.visible).toHaveLength(0);
    expect(res.hiddenCount).toBe(0);
  });
});

describe("formatDuration", () => {
  it("humanizes to a compact two-unit string", () => {
    expect(formatDuration(8040)).toBe("2h 14m");
    expect(formatDuration(90)).toBe("1m 30s");
    expect(formatDuration(45)).toBe("45s");
    expect(formatDuration(3600)).toBe("1h");
    expect(formatDuration(90000)).toBe("1d 1h");
    expect(formatDuration(0)).toBe("0s");
  });

  it("clamps negatives and rounds fractional seconds", () => {
    expect(formatDuration(-5)).toBe("0s");
    expect(formatDuration(59.6)).toBe("1m");
  });
});
