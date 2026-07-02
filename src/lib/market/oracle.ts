import { detectDelivery, assetStillPresent, type SteamAsset } from "./item-match";

/**
 * Oracle decision logic — pure functions over inventory snapshots, so they're deterministic and
 * unit-testable. The worker (Chunk 5 cron) supplies the live inventories (via steam-inventory.ts)
 * and drives the escrow client from these verdicts. No I/O here.
 */

export interface DeliveryCheck {
  status: "delivered" | "pending";
  /** The assetid that arrived — tracked for reversal detection during the hold. */
  deliveredAssetId: string | null;
}

/**
 * Has the exact listed item arrived? Compares the pre-trade snapshot of the buyer's inventory
 * against their current inventory (assetid-delta on the listed class/instance).
 */
export function checkDelivery(
  beforeSnapshot: readonly SteamAsset[],
  buyerInventoryNow: readonly SteamAsset[],
  classid: string,
  instanceid: string,
  /** Assetids already claimed by a sibling order — excluded so one copy can't pay two orders. */
  claimedAssetIds?: ReadonlySet<string>,
): DeliveryCheck {
  const r = detectDelivery(beforeSnapshot, buyerInventoryNow, classid, instanceid, claimedAssetIds);
  return { status: r.delivered ? "delivered" : "pending", deliveredAssetId: r.deliveredAssetId };
}

export type HoldVerdict = "hold" | "vanished" | "releasable";

/**
 * During the protection hold, decide what to do:
 *  - "vanished"    → the delivered copy left the buyer's inventory. s&box has NO Valve trade
 *                    reversal (its 7-day reversal is CS2-only), so this is NOT an involuntary
 *                    reversal we can auto-refund — it's ambiguous (buyer re-trade vs support action)
 *                    and the caller routes it to DISPUTE, never an auto-refund.
 *  - "releasable"  → still present AND the hold has elapsed → release to seller
 *  - "hold"        → still present but the hold hasn't elapsed → keep waiting
 */
export function checkHold(
  buyerInventoryNow: readonly SteamAsset[],
  deliveredAssetId: string,
  protectionUntil: number,
  now: number,
): HoldVerdict {
  if (!assetStillPresent(buyerInventoryNow, deliveredAssetId)) return "vanished";
  return now >= protectionUntil ? "releasable" : "hold";
}
