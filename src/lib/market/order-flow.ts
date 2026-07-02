import type { EscrowState } from "./escrow-state";
import type { SteamAsset } from "./item-match";
import { checkDelivery, checkHold } from "./oracle";
import type { CorrelatedDelivery } from "./trade-correlation";

/**
 * Pure oracle-tick reducer: given an order's current state + the buyer's inventory snapshots and the
 * pre-computed trade-offer correlation, decide the single next action. The Chunk-5 cron worker
 * fetches the inventories + trade offer, computes the correlation, calls this, then applies the
 * action (escrow client tx + Prisma persist). Keeping the decision pure makes the money path
 * deterministic and fully unit-testable.
 */

export type OrderAction =
  | { type: "confirm_delivery"; deliveredAssetId: string }
  | { type: "release" }
  | { type: "refund"; reason: string }
  | { type: "dispute"; reason: string }
  | { type: "wait" };

export interface OrderFlowInput {
  state: EscrowState;
  /** unix seconds — seller must deliver by here (else buyer refund). */
  deliveryDeadline: number;
  /** unix seconds — payout can't release before this (set once delivered). */
  protectionUntil: number | null;
  /** the assetid confirmed delivered (set once delivered), for reversal detection. */
  deliveredAssetId: string | null;
  classid: string;
  instanceid: string;
  /** buyer's inventory captured at order time (delivery = a new copy vs this). */
  beforeSnapshot: readonly SteamAsset[];
  /** buyer's inventory right now. */
  buyerInventoryNow: readonly SteamAsset[];
  /** assetids already claimed by the buyer's other live orders of this skin — excluded from
   *  delivery detection so one physical copy can't satisfy two orders (double-pay). */
  claimedAssetIds?: readonly string[];
  /**
   * PRIMARY delivery evidence: the result of correlating the seller's actual outgoing trade offer to
   * this order (see trade-correlation.ts). A seller Steam API key is mandatory to list, so the cron
   * always supplies this for FUNDED orders, making correlation the required delivery evidence.
   *   - a CorrelatedDelivery object → use it (delivered / not).
   *   - `null` → correlation ran and found no delivery → do NOT fall back to the fungible delta.
   *   - `undefined` → legacy callers with no key: fall back to the class-delta (kept per the review's
   *     backwards-compat note; unreachable in production).
   */
  correlation?: CorrelatedDelivery | null;
  now: number;
}

export function nextOrderAction(i: OrderFlowInput): OrderAction {
  if (i.state === "FUNDED") {
    // Trade-offer correlation is the primary, required evidence. `undefined` means no correlation was
    // supplied at all (legacy path) → fall back to the class-delta; any provided value (object or
    // null) means correlation is authoritative and the fungible delta is NOT consulted.
    if (i.correlation !== undefined) {
      if (i.correlation && i.correlation.delivered && i.correlation.deliveredAssetId) {
        return { type: "confirm_delivery", deliveredAssetId: i.correlation.deliveredAssetId };
      }
      if (i.now >= i.deliveryDeadline) {
        // A COMPLETE Steam trade of the exact listed asset that merely failed corroboration
        // (inventory lag, instant buyer re-trade, sibling claim) must never SLA-refund — the buyer
        // may hold both the item and the money. Freeze for the operator instead.
        if (i.correlation?.tradeCompleted) {
          return {
            type: "dispute",
            reason: `delivery SLA elapsed with a completed Steam trade that could not be corroborated — ${i.correlation.reason}`,
          };
        }
        return { type: "refund", reason: "delivery SLA elapsed with no correlated delivery" };
      }
      return { type: "wait" };
    }

    // Legacy fallback — class-fungible assetid delta. Exploitable on its own (the wrong-copy latch),
    // so it is never the sole evidence when a seller key exists; retained only for the no-key path,
    // which cannot occur in production (a key is mandatory to list).
    const claimed = i.claimedAssetIds && i.claimedAssetIds.length ? new Set(i.claimedAssetIds) : undefined;
    const d = checkDelivery(i.beforeSnapshot, i.buyerInventoryNow, i.classid, i.instanceid, claimed);
    if (d.status === "delivered" && d.deliveredAssetId) {
      return { type: "confirm_delivery", deliveredAssetId: d.deliveredAssetId };
    }
    if (i.now >= i.deliveryDeadline) {
      return { type: "refund", reason: "delivery SLA elapsed with no delivery" };
    }
    return { type: "wait" };
  }

  if (i.state === "PROTECTION_HOLD" && i.protectionUntil !== null && !i.deliveredAssetId) {
    // Operator-vouched hold: a pre-delivery dispute resolved for the seller starts the hold with no
    // oracle-confirmed assetid to monitor (see escrow resolve()). Release once it elapses; there is
    // nothing to vanish-check — the operator already vouched for delivery.
    return i.now >= i.protectionUntil ? { type: "release" } : { type: "wait" };
  }

  if (i.state === "PROTECTION_HOLD" && i.deliveredAssetId && i.protectionUntil !== null) {
    const v = checkHold(i.buyerInventoryNow, i.deliveredAssetId, i.protectionUntil, i.now);
    if (v === "vanished") {
      // The delivered copy left the buyer's inventory. s&box has no Valve trade reversal, so this is
      // ambiguous (buyer voluntarily re-traded it onward vs a rare Steam Support action) and MUST NOT
      // auto-refund — that would be the buyer get-item-and-money-back exploit. Freeze for the operator.
      return {
        type: "dispute",
        reason:
          "delivered item left the buyer's inventory during the protection hold — needs manual review (no Valve reversal exists for s&box)",
      };
    }
    if (v === "releasable") return { type: "release" };
    return { type: "wait" };
  }

  // RELEASED / REFUNDED / DISPUTED, or malformed PROTECTION_HOLD → the cron does nothing
  // (DISPUTED is resolved by the operator, not the automatic tick).
  return { type: "wait" };
}
