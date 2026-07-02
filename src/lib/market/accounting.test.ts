import { describe, it, expect } from "vitest";
import {
  deriveLedger,
  summarize,
  monthlyBreakdown,
  toLedgerCsv,
  FEE_ACCOUNT,
  type AccountingOrder,
} from "./accounting";
import { splitFee } from "./fees";

const USDC = (n: number) => BigInt(n) * BigInt(1_000_000);

/** Build an order with sane defaults; override just what a test cares about. */
function order(over: Partial<AccountingOrder> & { id: string }): AccountingOrder {
  return {
    priceUsdc: USDC(100),
    feeBps: 360,
    state: "PENDING",
    fundedAt: null,
    deliveredAt: null,
    releasedAt: null,
    refundedAt: null,
    buyerWallet: "buyerWallet",
    sellerWallet: "sellerWallet",
    ...over,
  };
}

const D = (iso: string) => new Date(iso);

describe("deriveLedger", () => {
  it("emits ESCROW_IN for a funded (not-yet-settled) order at fundedAt", () => {
    const entries = deriveLedger([
      order({ id: "a", state: "FUNDED", priceUsdc: USDC(50), fundedAt: D("2026-01-05T10:00:00Z") }),
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      orderId: "a",
      type: "ESCROW_IN",
      amount: USDC(50),
      counterparty: "buyerWallet",
    });
    expect(entries[0].timestamp.toISOString()).toBe("2026-01-05T10:00:00.000Z");
  });

  it("emits ESCROW_IN + PAYOUT_SELLER + FEE_REVENUE for a RELEASED order, fee via splitFee", () => {
    const price = USDC(100);
    const { sellerAmount, feeAmount } = splitFee(price, 360);
    const entries = deriveLedger([
      order({
        id: "r",
        state: "RELEASED",
        priceUsdc: price,
        fundedAt: D("2026-02-01T00:00:00Z"),
        releasedAt: D("2026-02-02T00:00:00Z"),
      }),
    ]);
    const byType = Object.fromEntries(entries.map((e) => [e.type, e]));
    expect(entries).toHaveLength(3);
    expect(byType.ESCROW_IN.amount).toBe(price);
    expect(byType.PAYOUT_SELLER).toMatchObject({ amount: sellerAmount, counterparty: "sellerWallet" });
    expect(byType.FEE_REVENUE).toMatchObject({ amount: feeAmount, counterparty: FEE_ACCOUNT });
    // payout + fee sum back to gross (no dust) and both land at releasedAt.
    expect(byType.PAYOUT_SELLER.amount + byType.FEE_REVENUE.amount).toBe(price);
    expect(byType.PAYOUT_SELLER.timestamp.toISOString()).toBe("2026-02-02T00:00:00.000Z");
    expect(byType.FEE_REVENUE.timestamp.toISOString()).toBe("2026-02-02T00:00:00.000Z");
  });

  it("emits ESCROW_IN + REFUND_BUYER for a REFUNDED order", () => {
    const entries = deriveLedger([
      order({
        id: "x",
        state: "REFUNDED",
        priceUsdc: USDC(20),
        fundedAt: D("2026-03-01T00:00:00Z"),
        refundedAt: D("2026-03-03T00:00:00Z"),
      }),
    ]);
    const types = entries.map((e) => e.type);
    expect(types).toEqual(["ESCROW_IN", "REFUND_BUYER"]);
    const refund = entries.find((e) => e.type === "REFUND_BUYER")!;
    expect(refund).toMatchObject({ amount: USDC(20), counterparty: "buyerWallet" });
  });

  it("omits ESCROW_IN for a PENDING order (no funds moved yet)", () => {
    expect(deriveLedger([order({ id: "p", state: "PENDING" })])).toEqual([]);
  });

  it("a tampered-funding refund (REFUNDED, fundedAt null) emits NO legs — the ledger stays balanced", () => {
    // The order never legitimately funded (never promoted, fundedAt null), so neither ESCROW_IN nor
    // REFUND_BUYER may appear: an unpaired REFUND_BUYER would show money leaving that never entered.
    expect(
      deriveLedger([
        order({ id: "t", state: "REFUNDED", fundedAt: null, refundedAt: D("2026-03-03T00:00:00Z") }),
      ]),
    ).toEqual([]);
  });

  it("skips entries whose driving timestamp is missing (defensive)", () => {
    // RELEASED but releasedAt null, and funded but fundedAt null → nothing to place on the timeline.
    expect(
      deriveLedger([order({ id: "n", state: "RELEASED", fundedAt: null, releasedAt: null })]),
    ).toEqual([]);
  });

  it("returns [] for an empty input", () => {
    expect(deriveLedger([])).toEqual([]);
  });

  it("sorts chronologically, with a stable in-timestamp order (payout before fee)", () => {
    const entries = deriveLedger([
      order({ id: "late", state: "FUNDED", fundedAt: D("2026-05-10T00:00:00Z") }),
      order({
        id: "early",
        state: "RELEASED",
        fundedAt: D("2026-01-01T00:00:00Z"),
        releasedAt: D("2026-01-02T00:00:00Z"),
      }),
    ]);
    expect(entries.map((e) => [e.orderId, e.type])).toEqual([
      ["early", "ESCROW_IN"],
      ["early", "PAYOUT_SELLER"],
      ["early", "FEE_REVENUE"],
      ["late", "ESCROW_IN"],
    ]);
  });

  it("carries a null counterparty when a wallet is unknown", () => {
    const entries = deriveLedger([
      order({ id: "w", state: "FUNDED", fundedAt: D("2026-01-01T00:00:00Z"), buyerWallet: null }),
    ]);
    expect(entries[0].counterparty).toBeNull();
  });
});

describe("summarize", () => {
  it("rolls up volume, fee revenue, refunds, and escrow float across states", () => {
    const orders: AccountingOrder[] = [
      order({ id: "1", state: "RELEASED", priceUsdc: USDC(100), fundedAt: D("2026-01-01T00:00:00Z"), releasedAt: D("2026-01-02T00:00:00Z") }),
      order({ id: "2", state: "RELEASED", priceUsdc: USDC(200), fundedAt: D("2026-01-01T00:00:00Z"), releasedAt: D("2026-01-03T00:00:00Z") }),
      order({ id: "3", state: "REFUNDED", priceUsdc: USDC(50), fundedAt: D("2026-01-01T00:00:00Z"), refundedAt: D("2026-01-02T00:00:00Z") }),
      order({ id: "4", state: "FUNDED", priceUsdc: USDC(30), fundedAt: D("2026-01-04T00:00:00Z") }),
      order({ id: "5", state: "PROTECTION_HOLD", priceUsdc: USDC(40), fundedAt: D("2026-01-04T00:00:00Z") }),
      order({ id: "6", state: "DISPUTED", priceUsdc: USDC(70), fundedAt: D("2026-01-04T00:00:00Z") }),
      order({ id: "7", state: "PENDING", priceUsdc: USDC(999) }),
    ];
    const s = summarize(orders);
    expect(s.grossReleasedVolume).toBe(USDC(300));
    expect(s.feeRevenue).toBe(splitFee(USDC(100), 360).feeAmount + splitFee(USDC(200), 360).feeAmount);
    expect(s.refundedVolume).toBe(USDC(50));
    // DISPUTED must be included in the float alongside FUNDED + PROTECTION_HOLD.
    expect(s.inEscrowFloat).toBe(USDC(30) + USDC(40) + USDC(70));
    expect(s.countsByState).toMatchObject({
      RELEASED: 2,
      REFUNDED: 1,
      FUNDED: 1,
      PROTECTION_HOLD: 1,
      DISPUTED: 1,
      PENDING: 1,
    });
  });

  it("excludes tampered-funding orders (fundedAt null) from refundedVolume and inEscrowFloat but still counts them", () => {
    const s = summarize([
      // Refunded straight off a tampered funding — never promoted, fundedAt null: not real volume.
      order({ id: "t1", state: "REFUNDED", priceUsdc: USDC(500), fundedAt: null, refundedAt: D("2026-01-02T00:00:00Z") }),
      // Disputed tampered funding — no verified deposit, so nothing to count as float.
      order({ id: "t2", state: "DISPUTED", priceUsdc: USDC(700), fundedAt: null }),
      // A legitimately funded order for contrast.
      order({ id: "ok", state: "FUNDED", priceUsdc: USDC(30), fundedAt: D("2026-01-04T00:00:00Z") }),
    ]);
    expect(s.refundedVolume).toBe(BigInt(0));
    expect(s.inEscrowFloat).toBe(USDC(30));
    // countsByState is deliberately NOT fundedAt-gated — operators still see the rows.
    expect(s.countsByState).toMatchObject({ REFUNDED: 1, DISPUTED: 1, FUNDED: 1 });
  });

  it("computes avgTimeToDeliverSeconds only over orders with both fundedAt and deliveredAt", () => {
    const s = summarize([
      order({ id: "a", state: "RELEASED", fundedAt: D("2026-01-01T00:00:00Z"), deliveredAt: D("2026-01-01T01:00:00Z"), releasedAt: D("2026-01-02T00:00:00Z") }), // 3600s
      order({ id: "b", state: "PROTECTION_HOLD", fundedAt: D("2026-01-01T00:00:00Z"), deliveredAt: D("2026-01-01T02:00:00Z") }), // 7200s
      order({ id: "c", state: "FUNDED", fundedAt: D("2026-01-01T00:00:00Z"), deliveredAt: null }), // ignored
    ]);
    expect(s.avgTimeToDeliverSeconds).toBe(5400);
  });

  it("returns null avgTimeToDeliver and all-zero counts for an empty set", () => {
    const s = summarize([]);
    expect(s.grossReleasedVolume).toBe(BigInt(0));
    expect(s.feeRevenue).toBe(BigInt(0));
    expect(s.refundedVolume).toBe(BigInt(0));
    expect(s.inEscrowFloat).toBe(BigInt(0));
    expect(s.avgTimeToDeliverSeconds).toBeNull();
    expect(s.countsByState).toMatchObject({ PENDING: 0, FUNDING: 0, FUNDED: 0, RELEASED: 0, REFUNDED: 0, DISPUTED: 0, PROTECTION_HOLD: 0 });
  });
});

describe("monthlyBreakdown", () => {
  it("buckets released + refunded by their settlement month (UTC), sorted oldest first", () => {
    const rows = monthlyBreakdown([
      order({ id: "1", state: "RELEASED", priceUsdc: USDC(100), releasedAt: D("2026-01-15T12:00:00Z") }),
      order({ id: "2", state: "RELEASED", priceUsdc: USDC(100), releasedAt: D("2026-01-20T12:00:00Z") }),
      order({ id: "3", state: "REFUNDED", priceUsdc: USDC(40), refundedAt: D("2026-01-25T12:00:00Z") }),
      order({ id: "4", state: "RELEASED", priceUsdc: USDC(300), releasedAt: D("2026-02-02T12:00:00Z") }),
    ]);
    expect(rows.map((r) => r.month)).toEqual(["2026-01", "2026-02"]);

    const jan = rows[0];
    expect(jan.releasedVolume).toBe(USDC(200));
    expect(jan.feeRevenue).toBe(splitFee(USDC(100), 360).feeAmount * BigInt(2));
    expect(jan.refundedVolume).toBe(USDC(40));
    expect(jan.releasedCount).toBe(2);
    expect(jan.refundedCount).toBe(1);
    expect(jan.orderCount).toBe(3);

    const feb = rows[1];
    expect(feb.releasedVolume).toBe(USDC(300));
    expect(feb.refundedVolume).toBe(BigInt(0));
    expect(feb.orderCount).toBe(1);
  });

  it("uses UTC month boundaries (a late-UTC-day release near month end stays in that month)", () => {
    const rows = monthlyBreakdown([
      order({ id: "1", state: "RELEASED", priceUsdc: USDC(10), releasedAt: D("2026-01-31T23:59:59Z") }),
      order({ id: "2", state: "RELEASED", priceUsdc: USDC(10), releasedAt: D("2026-02-01T00:00:01Z") }),
    ]);
    expect(rows.map((r) => r.month)).toEqual(["2026-01", "2026-02"]);
  });

  it("omits non-settled orders and returns [] when nothing settled", () => {
    expect(
      monthlyBreakdown([
        order({ id: "p", state: "PENDING" }),
        order({ id: "f", state: "FUNDED", fundedAt: D("2026-01-01T00:00:00Z") }),
      ]),
    ).toEqual([]);
  });
});

describe("toLedgerCsv", () => {
  it("writes a header plus one row per entry with decimal USDC amounts", () => {
    const csv = toLedgerCsv(
      deriveLedger([
        order({
          id: "ord1",
          state: "RELEASED",
          priceUsdc: USDC(100),
          fundedAt: D("2026-01-01T00:00:00Z"),
          releasedAt: D("2026-01-02T00:00:00Z"),
        }),
      ]),
    );
    const lines = csv.split("\n");
    expect(lines[0]).toBe("timestamp,orderId,type,amountUsdc,counterparty");
    expect(lines).toHaveLength(4); // header + ESCROW_IN + PAYOUT_SELLER + FEE_REVENUE
    expect(lines[1]).toBe("2026-01-01T00:00:00.000Z,ord1,ESCROW_IN,100.00,buyerWallet");
    // 3.6% of 100 = 3.60 fee, 96.40 to seller
    expect(csv).toContain("PAYOUT_SELLER,96.40,sellerWallet");
    expect(csv).toContain(`FEE_REVENUE,3.60,${FEE_ACCOUNT}`);
  });

  it("returns just the header for an empty ledger", () => {
    expect(toLedgerCsv([])).toBe("timestamp,orderId,type,amountUsdc,counterparty");
  });

  it("neutralizes spreadsheet formula injection in the counterparty cell", () => {
    const csv = toLedgerCsv([
      {
        orderId: "z",
        type: "REFUND_BUYER",
        amount: USDC(1),
        counterparty: "=cmd|calc",
        timestamp: D("2026-01-01T00:00:00Z"),
      },
    ]);
    // leading '=' is prefixed with a single quote and the whole field quoted.
    expect(csv).toContain('"\'=cmd|calc"');
  });
});
