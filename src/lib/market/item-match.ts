/**
 * Exact-item delivery matching — the anti-scam core of the oracle.
 *
 * Releasing on "a trade happened" would let a seller send a junk skin and still get paid. So the
 * oracle must confirm the *specific listed item* landed in the buyer's inventory. Steam items of
 * the same skin share (classid, instanceid) but each physical copy has a unique `assetid` that
 * changes on every trade — so we detect delivery by an **assetid-delta**: a new assetid of the
 * listed class appearing in the buyer's inventory that wasn't there in the pre-trade snapshot.
 * This is correct even when the buyer already owned identical copies of the same skin.
 */

export interface SteamAsset {
  assetid: string;
  classid: string;
  instanceid: string;
  amount?: string;
}

/** The set of assetids in `inventory` matching a given (classid, instanceid). */
export function assetIdsForClass(
  inventory: readonly SteamAsset[],
  classid: string,
  instanceid: string,
): Set<string> {
  const ids = new Set<string>();
  for (const a of inventory) {
    if (a.classid === classid && a.instanceid === instanceid) ids.add(a.assetid);
  }
  return ids;
}

export interface DeliveryResult {
  delivered: boolean;
  /** The assetid of the newly-arrived copy, to track for reversal during the protection hold. */
  deliveredAssetId: string | null;
}

/**
 * True (with the new assetid) iff `after` contains a copy of (classid, instanceid) that `before`
 * did not — i.e. the exact listed item was delivered, even if identical copies already existed.
 */
export function detectDelivery(
  before: readonly SteamAsset[],
  after: readonly SteamAsset[],
  classid: string,
  instanceid: string,
  /** Assetids already claimed by another live order — skip them so one physical copy can't
   *  satisfy two concurrent orders (double-pay). */
  exclude?: ReadonlySet<string>,
): DeliveryResult {
  const had = assetIdsForClass(before, classid, instanceid);
  const now = assetIdsForClass(after, classid, instanceid);
  for (const id of now) {
    if (!had.has(id) && !exclude?.has(id)) return { delivered: true, deliveredAssetId: id };
  }
  return { delivered: false, deliveredAssetId: null };
}

/**
 * Presence check for the protection hold: the delivered copy must still be in the buyer's
 * inventory. If it's gone (buyer re-traded it onward, or some rare support action), do NOT release —
 * and, because s&box has no Valve trade reversal, do NOT auto-refund either: the caller routes it to
 * DISPUTE for operator review (see oracle.checkHold / order-flow).
 */
export function assetStillPresent(
  inventory: readonly SteamAsset[],
  assetid: string,
): boolean {
  return inventory.some((a) => a.assetid === assetid);
}
