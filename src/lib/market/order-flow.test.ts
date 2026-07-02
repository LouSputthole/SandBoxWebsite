import { describe, it, expect } from "vitest";
import { nextOrderAction, type OrderFlowInput } from "./order-flow";
import type { SteamAsset } from "./item-match";

const a = (assetid: string): SteamAsset => ({ assetid, classid: "C1", instanceid: "I1" });

const base: OrderFlowInput = {
  state: "FUNDED",
  deliveryDeadline: 1_000,
  protectionUntil: null,
  deliveredAssetId: null,
  classid: "C1",
  instanceid: "I1",
  beforeSnapshot: [a("A1")],
  buyerInventoryNow: [a("A1")],
  now: 500,
};

describe("nextOrderAction — FUNDED", () => {
  it("confirms delivery when the exact item arrives", () => {
    expect(nextOrderAction({ ...base, buyerInventoryNow: [a("A1"), a("A2")] })).toEqual({
      type: "confirm_delivery",
      deliveredAssetId: "A2",
    });
  });

  it("waits while undelivered and before the SLA", () => {
    expect(nextOrderAction(base)).toEqual({ type: "wait" });
  });

  it("refunds when the delivery SLA elapses with no delivery", () => {
    expect(nextOrderAction({ ...base, now: 1_000 })).toMatchObject({ type: "refund" });
  });

  it("does not confirm on a copy already claimed by a sibling order (anti double-pay)", () => {
    // A2 is the only new copy, but a sibling order already claimed it → keep waiting.
    expect(
      nextOrderAction({ ...base, buyerInventoryNow: [a("A1"), a("A2")], claimedAssetIds: ["A2"] }),
    ).toEqual({ type: "wait" });
  });

  it("delivery beats the SLA if both are true this tick", () => {
    // arrived AND past deadline → still confirm delivery (item is here), don't refund
    expect(
      nextOrderAction({ ...base, now: 2_000, buyerInventoryNow: [a("A1"), a("A2")] }),
    ).toMatchObject({ type: "confirm_delivery" });
  });
});

describe("nextOrderAction — PROTECTION_HOLD", () => {
  const hold: OrderFlowInput = {
    ...base,
    state: "PROTECTION_HOLD",
    protectionUntil: 10_000,
    deliveredAssetId: "A2",
    beforeSnapshot: [a("A1")],
    buyerInventoryNow: [a("A1"), a("A2")],
  };

  it("waits while held and the window hasn't elapsed", () => {
    expect(nextOrderAction({ ...hold, now: 9_000 })).toEqual({ type: "wait" });
  });

  it("releases once present and the window elapses", () => {
    expect(nextOrderAction({ ...hold, now: 10_000 })).toEqual({ type: "release" });
  });

  it("DISPUTES (never auto-refunds) when the delivered copy vanished during the hold", () => {
    // s&box has no Valve reversal, so a delivered item leaving the buyer's inventory is ambiguous
    // (buyer re-trade vs support action) and must freeze for review — not auto-refund the buyer.
    const r = nextOrderAction({ ...hold, now: 99_999, buyerInventoryNow: [a("A1")] });
    expect(r.type).toBe("dispute");
    expect(r).not.toMatchObject({ type: "refund" });
  });

  it("operator-vouched hold (no deliveredAssetId, from a resolved pre-delivery dispute) releases on elapse", () => {
    // resolveDispute("release") on a pre-delivery dispute starts the hold with no oracle-confirmed
    // assetid to monitor — the tick must still release it once the hold elapses (no vanish-check).
    const vouched = { ...hold, deliveredAssetId: null };
    expect(nextOrderAction({ ...vouched, now: 9_000 })).toEqual({ type: "wait" });
    expect(nextOrderAction({ ...vouched, now: 10_000 })).toEqual({ type: "release" });
  });
});

describe("nextOrderAction — FUNDED with trade-offer correlation (primary evidence)", () => {
  const delivered = {
    delivered: true,
    deliveredAssetId: "NEW1",
    tradeCompleted: true,
    reason: "correlated delivery confirmed",
  };
  const notDelivered = {
    delivered: false,
    deliveredAssetId: null,
    tradeCompleted: false,
    reason: "trade not complete",
  };
  const completedUncorroborated = {
    delivered: false,
    deliveredAssetId: null,
    tradeCompleted: true,
    reason: "correlated asset NEW1 is not yet visible in the buyer's inventory",
  };

  it("confirms delivery from the correlation result (not the class-delta)", () => {
    // Buyer inventory shows a same-class copy that would tempt the class-delta, but correlation is
    // authoritative and names the real delivered assetid.
    expect(
      nextOrderAction({ ...base, buyerInventoryNow: [a("A1"), a("A2")], correlation: delivered }),
    ).toEqual({ type: "confirm_delivery", deliveredAssetId: "NEW1" });
  });

  it("does NOT fall back to the class-delta when correlation says not-delivered", () => {
    // A same-class copy arrived (would latch under the old delta) but correlation rejects it → wait.
    expect(
      nextOrderAction({ ...base, buyerInventoryNow: [a("A1"), a("A2")], correlation: notDelivered }),
    ).toEqual({ type: "wait" });
  });

  it("does NOT fall back when correlation is null (correlation ran, found nothing)", () => {
    expect(
      nextOrderAction({ ...base, buyerInventoryNow: [a("A1"), a("A2")], correlation: null }),
    ).toEqual({ type: "wait" });
  });

  it("refunds on SLA when correlation reports no delivery past the deadline", () => {
    expect(
      nextOrderAction({ ...base, now: 2_000, correlation: notDelivered }),
    ).toMatchObject({ type: "refund" });
  });

  it("DISPUTES (never refunds) on SLA when the trade COMPLETED but corroboration failed", () => {
    // Steam says the exact listed asset moved to the buyer in a complete trade, but it isn't
    // visible in their inventory (lag or an instant re-trade). Refunding would hand the buyer the
    // item AND the money — freeze for the operator instead.
    const r = nextOrderAction({ ...base, now: 2_000, correlation: completedUncorroborated });
    expect(r.type).toBe("dispute");
    expect(r).not.toMatchObject({ type: "refund" });
  });

  it("waits (retries corroboration) before the deadline when the trade completed uncorroborated", () => {
    expect(
      nextOrderAction({ ...base, now: 500, correlation: completedUncorroborated }),
    ).toEqual({ type: "wait" });
  });
});

describe("nextOrderAction — terminal/dispute", () => {
  it("does nothing automatic for RELEASED/REFUNDED/DISPUTED", () => {
    for (const state of ["RELEASED", "REFUNDED", "DISPUTED"] as const) {
      expect(nextOrderAction({ ...base, state })).toEqual({ type: "wait" });
    }
  });
});
