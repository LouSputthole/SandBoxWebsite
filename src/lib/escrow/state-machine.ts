/**
 * EscrowTrade state machine. Pure functions only — no DB access — so it
 * can be tested as plain logic and so callers can validate transitions
 * before mutating Postgres.
 *
 * State diagram:
 *
 *   pending_deposit ──(seller deposits)──> awaiting_payment
 *         │                                       │
 *         │                                       │ (buyer pays + webhook)
 *         │                                       ▼
 *         │                             payment_confirmed
 *         │                                       │
 *         │                                       │ (bot sends item, buyer accepts)
 *         │                                       ▼
 *         │                                  completed
 *         │
 *         ├──(timeout)─────────> cancelled
 *         └──(seller cancel)────> cancelled
 *
 *   awaiting_payment ──(timeout)────> cancelled (item returned to seller)
 *   awaiting_payment ──(buyer abandon)─> cancelled
 *
 *   payment_confirmed ──(bot fail)────> disputed
 *
 *   any state ──(complaint)─────────> disputed
 *
 *   disputed ──(admin)────────> completed | refunded | cancelled
 *
 * "refunded" is reserved for "buyer paid, didn't receive item, money
 * returned." "cancelled" covers any close before payment cleared.
 */

export type EscrowState =
  | "pending_deposit"
  | "awaiting_payment"
  | "payment_confirmed"
  | "completed"
  | "disputed"
  | "refunded"
  | "cancelled";

export type EscrowEvent =
  | { kind: "seller_deposited" }
  | { kind: "deposit_timeout" }
  | { kind: "seller_cancelled" }
  | { kind: "payment_confirmed" }
  | { kind: "payment_timeout" }
  | { kind: "buyer_abandoned" }
  | { kind: "bot_release_failed"; reason: string }
  | { kind: "buyer_received" }
  | { kind: "complaint_filed"; openedBy: "buyer" | "seller" | "system"; reason: string }
  | {
      kind: "dispute_resolved";
      resolution:
        | "released_to_buyer"
        | "refunded_to_buyer"
        | "returned_to_seller"
        | "rejected";
    };

export interface TransitionResult {
  ok: boolean;
  nextState?: EscrowState;
  error?: string;
}

/**
 * Compute the next state from a (current_state, event) pair. Returns
 * { ok: false, error } when the event is invalid for the current
 * state — callers should treat that as a programming error / race
 * (e.g. webhook arriving after manual cancel) and surface it loudly.
 */
export function transition(
  current: EscrowState,
  event: EscrowEvent,
): TransitionResult {
  switch (current) {
    case "pending_deposit":
      switch (event.kind) {
        case "seller_deposited":
          return { ok: true, nextState: "awaiting_payment" };
        case "deposit_timeout":
        case "seller_cancelled":
          return { ok: true, nextState: "cancelled" };
        case "complaint_filed":
          return { ok: true, nextState: "disputed" };
      }
      break;

    case "awaiting_payment":
      switch (event.kind) {
        case "payment_confirmed":
          return { ok: true, nextState: "payment_confirmed" };
        case "payment_timeout":
        case "buyer_abandoned":
          // Item still has to be returned to the seller, but the trade
          // state itself is "cancelled" — the bot worker handles the
          // refund offer separately.
          return { ok: true, nextState: "cancelled" };
        case "complaint_filed":
          return { ok: true, nextState: "disputed" };
      }
      break;

    case "payment_confirmed":
      switch (event.kind) {
        case "buyer_received":
          return { ok: true, nextState: "completed" };
        case "bot_release_failed":
        case "complaint_filed":
          return { ok: true, nextState: "disputed" };
      }
      break;

    case "disputed":
      if (event.kind === "dispute_resolved") {
        switch (event.resolution) {
          case "released_to_buyer":
            return { ok: true, nextState: "completed" };
          case "refunded_to_buyer":
            return { ok: true, nextState: "refunded" };
          case "returned_to_seller":
            return { ok: true, nextState: "cancelled" };
          case "rejected":
            // Admin determined the dispute is invalid — flip back to
            // payment_confirmed so the bot retries the release.
            return { ok: true, nextState: "payment_confirmed" };
        }
      }
      break;

    case "completed":
    case "refunded":
    case "cancelled":
      return {
        ok: false,
        error: `Trade is in terminal state ${current}; ${event.kind} ignored`,
      };
  }

  return {
    ok: false,
    error: `Invalid transition: ${current} + ${event.kind}`,
  };
}

/**
 * Convenience predicate for places that only care "is the trade still
 * open?" — e.g. listing-status updates that should refuse to cancel a
 * listing with an in-flight escrow.
 */
export function isOpen(state: EscrowState): boolean {
  return (
    state === "pending_deposit" ||
    state === "awaiting_payment" ||
    state === "payment_confirmed" ||
    state === "disputed"
  );
}

/**
 * Default fee = 5% of priceUsd, with a $1 minimum so micro-trades
 * don't get a free pass on operational cost. Returns USD.
 */
export function calculateFee(priceUsd: number): number {
  const fee = priceUsd * 0.05;
  return Math.max(1, Math.round(fee * 100) / 100);
}

export const DEPOSIT_DEADLINE_HOURS = 24;
export const PAYMENT_DEADLINE_HOURS = 6;

export function depositDeadlineFrom(now: Date = new Date()): Date {
  return new Date(now.getTime() + DEPOSIT_DEADLINE_HOURS * 60 * 60 * 1000);
}

export function paymentDeadlineFrom(now: Date = new Date()): Date {
  return new Date(now.getTime() + PAYMENT_DEADLINE_HOURS * 60 * 60 * 1000);
}
