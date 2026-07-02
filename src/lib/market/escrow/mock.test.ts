import { describe, it, expect, beforeEach } from "vitest";
import { MockEscrowClient } from "./mock";
import { EscrowMismatchError } from "./types";
import { PROTECTION_PERIOD_SECONDS } from "../escrow-state";

const AMOUNT = BigInt(100_000_000); // 100 USDC
const params = (over: Partial<Parameters<MockEscrowClient["openEscrow"]>[0]> = {}) => ({
  orderId: "order-1",
  buyer: "BUYER",
  seller: "SELLER",
  amount: AMOUNT,
  feeBps: 360,
  deliveryDeadline: 1_000,
  ...over,
});

describe("MockEscrowClient", () => {
  let c: MockEscrowClient;
  beforeEach(() => {
    c = new MockEscrowClient();
  });

  it("opens an escrow in FUNDED with a pda", async () => {
    const { escrow } = await c.openEscrow(params());
    expect(escrow.state).toBe("FUNDED");
    expect(escrow.escrowPda).toBe("mock-pda-order-1");
    expect(escrow.protectionUntil).toBeNull();
  });

  it("rejects a duplicate order and self-dealing", async () => {
    await c.openEscrow(params());
    await expect(c.openEscrow(params())).rejects.toThrow(/already exists/);
    await expect(c.openEscrow(params({ orderId: "x", buyer: "SAME", seller: "SAME" }))).rejects.toThrow(
      /must differ/,
    );
  });

  it("happy path: confirm → hold → release pays seller 96.4% and fee 3.6%", async () => {
    await c.openEscrow(params());
    const confirmed = await c.confirmDelivery("order-1", PROTECTION_PERIOD_SECONDS, 2_000);
    expect(confirmed.escrow.state).toBe("PROTECTION_HOLD");
    expect(confirmed.escrow.protectionUntil).toBe(2_000 + PROTECTION_PERIOD_SECONDS);

    // cannot release before the hold elapses
    await expect(c.release("order-1", 2_000)).rejects.toThrow(/release not allowed/);

    const released = await c.release("order-1", 2_000 + PROTECTION_PERIOD_SECONDS);
    expect(released.escrow.state).toBe("RELEASED");
    const seller = c.payouts.find((p) => p.kind === "seller");
    const fee = c.payouts.find((p) => p.kind === "fee");
    expect(seller).toMatchObject({ to: "SELLER", amount: BigInt(96_400_000) });
    expect(fee).toMatchObject({ to: "fee-account", amount: BigInt(3_600_000) });
    // funds conserved
    expect((seller!.amount as bigint) + (fee!.amount as bigint)).toBe(AMOUNT);
  });

  it("refund returns the full amount to the buyer", async () => {
    await c.openEscrow(params());
    const r = await c.refund("order-1", 5_000);
    expect(r.escrow.state).toBe("REFUNDED");
    expect(c.payouts).toEqual([{ to: "BUYER", amount: AMOUNT, kind: "refund", orderId: "order-1" }]);
  });

  it("reversal during hold refunds the buyer", async () => {
    await c.openEscrow(params());
    await c.confirmDelivery("order-1", PROTECTION_PERIOD_SECONDS, 2_000);
    const r = await c.refund("order-1", 3_000); // reversal detected mid-hold
    expect(r.escrow.state).toBe("REFUNDED");
    expect(c.payouts.at(-1)).toMatchObject({ to: "BUYER", amount: AMOUNT, kind: "refund" });
  });

  it("cannot release straight from FUNDED (must pass the hold)", async () => {
    await c.openEscrow(params());
    await expect(c.release("order-1", 9_999)).rejects.toThrow();
  });

  it("dispute: freeze then resolve-refund", async () => {
    await c.openEscrow(params());
    await c.freeze("order-1", "buyer says wrong item");
    expect((await c.get("order-1"))!.state).toBe("DISPUTED");
    await c.resolve("order-1", "refund", 5_000);
    expect((await c.get("order-1"))!.state).toBe("REFUNDED");
  });

  it("dispute resolve-release still respects the protection window", async () => {
    await c.openEscrow(params());
    await c.confirmDelivery("order-1", PROTECTION_PERIOD_SECONDS, 2_000);
    await c.freeze("order-1");
    await expect(c.resolve("order-1", "release", 2_500)).rejects.toThrow(/protection window/);
    const ok = await c.resolve("order-1", "release", 2_000 + PROTECTION_PERIOD_SECONDS);
    expect(ok.escrow.state).toBe("RELEASED");
  });

  it("PRE-DELIVERY dispute: resolve-release starts the hold instead of deadlocking (mirrors lib.rs)", async () => {
    await c.openEscrow(params());
    await c.freeze("order-1", "disputed before any delivery confirmation");
    // The hold never started (no confirmDelivery) — resolving for the seller must not pay instantly
    // nor fail forever: it starts the hold.
    const r = await c.resolve("order-1", "release", 5_000);
    expect(r.escrow.state).toBe("PROTECTION_HOLD");
    expect(r.escrow.protectionUntil).toBe(5_000 + PROTECTION_PERIOD_SECONDS);
    expect(c.payouts).toEqual([]); // nothing paid yet

    // The normal release path pays once the hold elapses (and not before).
    await expect(c.release("order-1", 5_001)).rejects.toThrow(/release not allowed/);
    const released = await c.release("order-1", 5_000 + PROTECTION_PERIOD_SECONDS);
    expect(released.escrow.state).toBe("RELEASED");
    expect(c.payouts.find((p) => p.kind === "seller")).toMatchObject({ to: "SELLER", amount: BigInt(96_400_000) });
  });

  it("throws for unknown orders", async () => {
    await expect(c.release("nope", 1)).rejects.toThrow(/no escrow/);
  });
});

describe("MockEscrowClient two-phase open", () => {
  let c: MockEscrowClient;
  beforeEach(() => {
    c = new MockEscrowClient();
  });

  it("prepareOpenEscrow returns nothing to sign (dev has no on-chain tx)", async () => {
    expect(await c.prepareOpenEscrow(params())).toEqual({ txBase64: null });
    // prepare has no side effects — no escrow created.
    expect(await c.get("order-1")).toBeNull();
  });

  it("submitAndVerifyOpenEscrow opens the escrow in FUNDED (ignores the signed tx), signature null", async () => {
    const { record: rec, signature } = await c.submitAndVerifyOpenEscrow(params(), null);
    expect(rec.state).toBe("FUNDED");
    expect(rec.escrowPda).toBe("mock-pda-order-1");
    expect(rec.amount).toBe(AMOUNT);
    expect(signature).toBeNull(); // no real open_escrow tx off-chain
    expect((await c.get("order-1"))!.state).toBe("FUNDED");
  });

  it("is idempotent: a second submit for the same matching order returns the existing record", async () => {
    const { record: first } = await c.submitAndVerifyOpenEscrow(params(), "signed-tx-a");
    const { record: second } = await c.submitAndVerifyOpenEscrow(params(), "signed-tx-b");
    expect(second).toEqual(first);
  });

  it("throws EscrowMismatchError when an existing escrow does not match the params", async () => {
    await c.submitAndVerifyOpenEscrow(params({ buyer: "REAL_BUYER" }), null);
    // A retry (or tampered client) with a different buyer/seller/amount is a mismatch, not idempotent.
    await expect(c.submitAndVerifyOpenEscrow(params({ buyer: "OTHER_BUYER" }), null)).rejects.toBeInstanceOf(
      EscrowMismatchError,
    );
    await expect(c.submitAndVerifyOpenEscrow(params({ buyer: "REAL_BUYER", amount: BigInt(1) }), null)).rejects.toThrow(
      EscrowMismatchError,
    );
  });
});
