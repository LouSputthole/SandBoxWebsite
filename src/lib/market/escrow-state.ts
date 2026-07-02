/**
 * Escrow order state machine (mirrors the on-chain program in `solana/sbox-escrow`).
 *
 * FUNDED ──confirm_delivery──▶ PROTECTION_HOLD ──(hold elapses)──▶ RELEASED
 *   │                              │
 *   │ delivery SLA lapses          │ delivered item vanishes during hold
 *   ▼                              ▼
 * REFUNDED                      DISPUTED   (s&box has no Valve reversal, so a vanished item is never
 *                                           auto-refunded — it freezes for operator review)
 * (either active state can be frozen → DISPUTED → RELEASED | REFUNDED by the operator;
 *  a PRE-DELIVERY dispute resolved for the seller goes DISPUTED → PROTECTION_HOLD — the hold starts
 *  at resolution because it never started via confirm_delivery; instant release stays impossible.
 *  The authorizer's refund() may also settle DISPUTED directly — same terminal state as resolve.)
 *
 * Time gates are pure functions of (`now`, deadlines) so they're deterministic and testable —
 * callers pass the current unix time in seconds; nothing here reads the clock.
 */

export type EscrowState = "FUNDED" | "PROTECTION_HOLD" | "RELEASED" | "REFUNDED" | "DISPUTED";

/**
 * A MarketOrder's lifecycle state. Superset of {@link EscrowState} with TWO pre-funding states that
 * exist ONLY in our DB (no on-chain escrow carries them):
 *   - "PENDING"  — the order exists but the buyer has not yet signed + submitted the (buyer-signed)
 *                  open_escrow transaction.
 *   - "FUNDING"  — a fundOrder call has atomically CLAIMED the order (PENDING → FUNDING) and is
 *                  submitting/verifying the buyer's tx right now. The claim is a mutual-exclusion
 *                  latch: it stops a concurrent cancel from deleting the row mid-confirm (orphaning
 *                  funds) and a second fund call from double-submitting. The oracle reaper reconciles
 *                  a stuck FUNDING row (funds landed → promote; nothing landed → delete) exactly as
 *                  it does a stale PENDING one.
 * Once funding verifies on-chain the order moves to FUNDED and from there tracks the on-chain
 * EscrowState 1:1. PENDING and FUNDING are therefore deliberately NOT EscrowStates.
 */
export type MarketOrderState = "PENDING" | "FUNDING" | EscrowState;

/**
 * Every valid MarketOrder.state value. Guarded by escrow-state.test.ts so adding/removing an order
 * state is a deliberate, reviewed change (the DB column is plain TEXT — this is the domain of truth).
 */
export const MARKET_ORDER_STATES: readonly MarketOrderState[] = [
  "PENDING",
  "FUNDING",
  "FUNDED",
  "PROTECTION_HOLD",
  "RELEASED",
  "REFUNDED",
  "DISPUTED",
];

/** Post-delivery payout hold — OUR dispute window (24h, decided by Lou 2026-07-01). Originally
 *  sized to Steam's 7-day trade-protection reversal window, but research
 *  (docs/superpowers/research/2026-07-01-steam-trade-protection.md) showed that window is CS2-only —
 *  s&box trades are never reversed by Valve, so a multi-day hold bought nothing. Next-day payouts
 *  are a competitive edge over 7-day-hold CS2 marketplaces. The on-chain program takes this value
 *  as `protection_period` at initialize_config — keep them in sync (86400). */
export const PROTECTION_PERIOD_SECONDS = 24 * 60 * 60; // 24 hours

/** Once a buyer funds escrow, the seller must send the Steam trade within this window or the
 *  order auto-cancels and the buyer is refunded. Also the raw signal for "avg time to accept". */
export const DEFAULT_DELIVERY_SLA_SECONDS = 8 * 60 * 60; // 8 hours

/** A pre-funded order — PENDING (buyer never confirmed on-chain funding) or FUNDING (a fund call
 *  claimed it and then died mid-confirm) — is reaped after this window by the oracle cron: delete it
 *  if nothing funded, promote it if funding landed late, or refund a mismatched funding. Stops an
 *  abandoned checkout / crashed fund call from holding the per-listing / per-asset "live order" lock
 *  forever (both partial-unique indexes count PENDING and FUNDING). */
export const PENDING_FUNDING_MAX_AGE_SECONDS = 10 * 60; // 10 minutes

const TRANSITIONS: Record<EscrowState, readonly EscrowState[]> = {
  FUNDED: ["PROTECTION_HOLD", "REFUNDED", "DISPUTED"],
  PROTECTION_HOLD: ["RELEASED", "REFUNDED", "DISPUTED"],
  // DISPUTED → PROTECTION_HOLD: a pre-delivery dispute resolved for the seller starts the hold
  // (it never started via confirm_delivery) — the deadlock fix; mirrors lib.rs resolve().
  DISPUTED: ["RELEASED", "REFUNDED", "PROTECTION_HOLD"],
  RELEASED: [],
  REFUNDED: [],
};

export function canTransition(from: EscrowState, to: EscrowState): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: EscrowState, to: EscrowState): void {
  if (!canTransition(from, to)) {
    throw new Error(`illegal escrow transition: ${from} -> ${to}`);
  }
}

/** A terminal state can never change again. */
export function isTerminal(state: EscrowState): boolean {
  return TRANSITIONS[state].length === 0;
}

/**
 * The buyer may unilaterally reclaim their funds only when the order is still FUNDED (seller
 * never delivered) AND the delivery SLA has lapsed. Contract-enforced buyer protection.
 */
export function buyerRefundAllowed(
  state: EscrowState,
  deliveryDeadline: number,
  now: number,
): boolean {
  return state === "FUNDED" && now >= deliveryDeadline;
}

/**
 * The seller's payout may release only after the trade-protection hold has fully elapsed —
 * even the authorizer cannot release early (defense in depth against a compromised oracle key).
 */
export function releaseAllowed(
  state: EscrowState,
  protectionUntil: number,
  now: number,
): boolean {
  return state === "PROTECTION_HOLD" && now >= protectionUntil;
}
