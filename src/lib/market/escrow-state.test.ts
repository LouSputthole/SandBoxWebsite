import { describe, it, expect } from "vitest";
import {
  canTransition,
  assertTransition,
  isTerminal,
  buyerRefundAllowed,
  releaseAllowed,
  PROTECTION_PERIOD_SECONDS,
  DEFAULT_DELIVERY_SLA_SECONDS,
  PENDING_FUNDING_MAX_AGE_SECONDS,
  MARKET_ORDER_STATES,
} from "./escrow-state";

describe("state transitions", () => {
  it("allows the happy path FUNDED → PROTECTION_HOLD → RELEASED", () => {
    expect(canTransition("FUNDED", "PROTECTION_HOLD")).toBe(true);
    expect(canTransition("PROTECTION_HOLD", "RELEASED")).toBe(true);
  });

  it("allows refunds and disputes from active states", () => {
    expect(canTransition("FUNDED", "REFUNDED")).toBe(true);
    expect(canTransition("PROTECTION_HOLD", "REFUNDED")).toBe(true);
    expect(canTransition("FUNDED", "DISPUTED")).toBe(true);
    expect(canTransition("DISPUTED", "RELEASED")).toBe(true);
    expect(canTransition("DISPUTED", "REFUNDED")).toBe(true);
  });

  it("forbids skipping the hold and mutating terminal states", () => {
    expect(canTransition("FUNDED", "RELEASED")).toBe(false); // must pass through the hold
    expect(canTransition("RELEASED", "REFUNDED")).toBe(false);
    expect(canTransition("REFUNDED", "RELEASED")).toBe(false);
    expect(() => assertTransition("FUNDED", "RELEASED")).toThrow(/illegal/);
  });

  it("marks terminal states", () => {
    expect(isTerminal("RELEASED")).toBe(true);
    expect(isTerminal("REFUNDED")).toBe(true);
    expect(isTerminal("FUNDED")).toBe(false);
  });
});

describe("buyerRefundAllowed", () => {
  const deadline = 1_000;
  it("only after the delivery SLA lapses, and only while FUNDED", () => {
    expect(buyerRefundAllowed("FUNDED", deadline, 999)).toBe(false); // too early
    expect(buyerRefundAllowed("FUNDED", deadline, 1_000)).toBe(true); // at deadline
    expect(buyerRefundAllowed("PROTECTION_HOLD", deadline, 2_000)).toBe(false); // delivered
  });
});

describe("releaseAllowed", () => {
  const protectionUntil = 5_000;
  it("only after the protection hold elapses, and only during PROTECTION_HOLD", () => {
    expect(releaseAllowed("PROTECTION_HOLD", protectionUntil, 4_999)).toBe(false);
    expect(releaseAllowed("PROTECTION_HOLD", protectionUntil, 5_000)).toBe(true);
    expect(releaseAllowed("FUNDED", protectionUntil, 9_999)).toBe(false);
  });
});

describe("constants", () => {
  it("hold is 24 hours (decided 2026-07-01 — s&box has no Valve reversal), delivery SLA is 8 hours", () => {
    expect(PROTECTION_PERIOD_SECONDS).toBe(86_400);
    expect(DEFAULT_DELIVERY_SLA_SECONDS).toBe(28_800);
  });

  it("reaps abandoned PENDING orders after 10 minutes", () => {
    expect(PENDING_FUNDING_MAX_AGE_SECONDS).toBe(600);
  });
});

describe("order-state domain", () => {
  it("MARKET_ORDER_STATES = the two pre-funding states (PENDING, FUNDING) + the five on-chain escrow states, in order", () => {
    expect([...MARKET_ORDER_STATES]).toEqual([
      "PENDING",
      "FUNDING",
      "FUNDED",
      "PROTECTION_HOLD",
      "RELEASED",
      "REFUNDED",
      "DISPUTED",
    ]);
  });

  it("PENDING and FUNDING are order states but never legal escrow transition targets (no on-chain PENDING/FUNDING)", () => {
    // The escrow state machine (mirrors the on-chain program) has no PENDING or FUNDING — funding
    // jumps straight to FUNDED. Guards against anyone wiring a pre-funding state into the table.
    for (const s of ["FUNDED", "PROTECTION_HOLD", "RELEASED", "REFUNDED", "DISPUTED"] as const) {
      expect(canTransition(s, "PENDING" as never)).toBe(false);
      expect(canTransition(s, "FUNDING" as never)).toBe(false);
    }
  });
});
