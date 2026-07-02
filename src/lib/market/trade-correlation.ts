import { assetIdsForClass, type SteamAsset } from "./item-match";
import { steamIdToAccountId } from "../trade/url";

/**
 * Trade-offer correlation — the PRIMARY delivery evidence for the oracle.
 *
 * The old class-fungible assetid-delta ("a new copy of the listed skin showed up in the buyer's
 * inventory") is exploitable: a copy of the same skin arriving from a DIFFERENT seller could be
 * latched to this order (wrong-copy latch, review HIGH). This module replaces that with a chain of
 * evidence tied to the SELLER's actual outgoing trade offer:
 *
 *   1. IEconService/GetTradeOffer/v1 → the offer's partner is the buyer, it is Accepted, and it
 *      GIVES the exact listed asset (assetid/classid/instanceid) — not a substitute junk skin.
 *   2. IEconService/GetTradeStatus/v1 (via the accepted offer's `tradeid`) → the trade is Complete
 *      and its `assets_given[]` line for the listed asset carries the `new_assetid` the item now
 *      has in the BUYER's inventory. That is the correlated delivered copy.
 *   3. Corroborate against the buyer's live inventory (the read the oracle already does) + a
 *      claimed-assetid exclude-set so one physical copy can't pay two sibling orders.
 *
 * All functions here are pure (no I/O) and unit-tested against JSON fixtures modeled on the
 * documented API responses (see __fixtures__/). The network fetch lives in steam-trade.ts.
 *
 * API shapes + enums verified against:
 *   - IEconService docs: https://partner.steamgames.com/doc/webapi/IEconService
 *   - Valve wiki: https://developer.valvesoftware.com/wiki/Steam_Web_API/IEconService
 *   - go-steamapi CEconTradeOffer/CEconAsset (JSON tags): Philipp15b/go-steamapi tradeoffer.go
 *   - steam-rs get_trade_history.rs (GetTradeStatus/GetTradeHistory Trade + Asset fields)
 *   - ETradeStatus values: DoctorMcKay/node-steam-tradeoffer-manager resources/ETradeStatus.js
 */

/**
 * ETradeOfferState (subset) — the *offer* lifecycle. `Accepted = 3` is the only state from which a
 * completed trade can exist. Source: SteamKit enums.steamd, go-steamapi (accepted=3).
 */
export const ETradeOfferState = {
  Active: 2,
  Accepted: 3,
} as const;

/**
 * ETradeStatus — the *trade* lifecycle (distinct from the offer state). `Complete = 3` is the only
 * status that proves the items actually moved. The rollback/escrow statuses are recorded as evidence
 * but — for s&box, which Valve does NOT reverse (its 7-day reversal is CS2-only, and Valve's Item
 * Restoration Policy is "we do not restore items") — are never used to auto-refund.
 * Source: DoctorMcKay/node-steam-tradeoffer-manager resources/ETradeStatus.js.
 */
export const ETradeStatus = {
  Init: 0,
  PreCommitted: 1,
  Committed: 2,
  Complete: 3,
  Failed: 4,
  PartialSupportRollback: 5,
  FullSupportRollback: 6,
  SupportRollbackSelective: 7,
  RollbackFailed: 8,
  RollbackAbandoned: 9,
  InEscrow: 10,
  EscrowRollback: 11,
} as const;

/** CEcon_Asset — an item line in a trade offer (IEconService/GetTradeOffer). Numeric ids are
 *  returned as strings; `appid` is a number. */
export interface EconOfferAsset {
  appid: number;
  contextid: string;
  assetid: string;
  classid: string;
  instanceid: string;
  amount: string;
  missing?: boolean;
}

/** IEconService/GetTradeOffer/v1 → response.offer. `accountid_other` is the trade partner's 32-bit
 *  account id (NOT a steamid64). `tradeid` is present once the offer is Accepted. */
export interface TradeOffer {
  tradeofferid: string;
  accountid_other: number;
  trade_offer_state: number;
  items_to_give?: EconOfferAsset[];
  items_to_receive?: EconOfferAsset[];
  tradeid?: string;
}

/** A traded-asset line in IEconService/GetTradeStatus/GetTradeHistory. `new_assetid` is the id the
 *  item takes in the RECIPIENT's inventory after the trade completes. */
export interface TradeStatusAsset {
  appid: number;
  contextid: string;
  assetid: string;
  amount: string;
  classid: string;
  instanceid: string;
  new_assetid?: string;
  new_contextid?: string;
  rollback_new_assetid?: string;
  rollback_new_contextid?: string;
}

/** IEconService/GetTradeStatus/v1 → response.trades[]. `steamid_other` is the partner's full
 *  steamid64. `status` is ETradeStatus. `assets_given` are the items the side whose API key was used
 *  (the seller) GAVE to the partner (the buyer). */
export interface TradeStatus {
  tradeid: string;
  steamid_other: string;
  status: number;
  time_init?: number;
  assets_given?: TradeStatusAsset[];
  assets_received?: TradeStatusAsset[];
}

/** The exact Steam copy this order is for (from the listing snapshot). */
export interface ListedAsset {
  appid: number;
  contextid: string;
  steamAssetId: string;
  classid: string;
  instanceid: string;
}

export interface CorrelatedDelivery {
  delivered: boolean;
  /** The buyer-side assetid of the delivered copy (`new_assetid`), tracked for the protection hold. */
  deliveredAssetId: string | null;
  /**
   * true = Steam says this seller's accepted offer moved the exact listed asset to the buyer in a
   * COMPLETE trade, even if corroboration (inventory visibility / sibling dedup) failed. An
   * uncorroborated-but-completed trade must never SLA-refund — the buyer may hold both the item and
   * the money (inventory lag or an instant re-trade). The reducer routes it to DISPUTE instead.
   */
  tradeCompleted: boolean;
  /** Audit/evidence string explaining the verdict — persisted for disputes + reconciliation. */
  reason: string;
}

function notDelivered(reason: string, tradeCompleted = false): CorrelatedDelivery {
  return { delivered: false, deliveredAssetId: null, tradeCompleted, reason };
}

function assetMatchesListed(
  a: { appid: number; assetid: string; classid: string; instanceid: string },
  listed: ListedAsset,
): boolean {
  return (
    a.appid === listed.appid &&
    a.assetid === listed.steamAssetId &&
    a.classid === listed.classid &&
    a.instanceid === listed.instanceid
  );
}

/**
 * Correlate the seller's outgoing trade offer + completed trade to THIS order. Returns `delivered`
 * only when every link holds; otherwise `reason` explains why (fed into evidence). This is the
 * fail-closed replacement for the class-fungible delta: a copy from a different seller cannot be
 * credited here because it never appears in THIS seller's accepted, completed offer.
 */
export function correlateDelivery(args: {
  offer: TradeOffer | null;
  trade: TradeStatus | null;
  listed: ListedAsset;
  buyerSteamId64: string;
  buyerInventoryNow: readonly SteamAsset[];
  /** assetids already claimed as delivered by the buyer's sibling orders of this skin. */
  excludeAssetIds?: ReadonlySet<string>;
}): CorrelatedDelivery {
  const { offer, trade, listed, buyerSteamId64, buyerInventoryNow, excludeAssetIds } = args;

  if (!offer) return notDelivered("no trade offer found for the recorded trade-offer id");

  // 1. The offer's partner must be the buyer. `accountid_other` is the 32-bit account id.
  const buyerAccountId = steamIdToAccountId(buyerSteamId64);
  if (!buyerAccountId) return notDelivered(`buyer steamid64 ${buyerSteamId64} is malformed`);
  if (String(offer.accountid_other) !== buyerAccountId) {
    return notDelivered(
      `trade offer partner (accountid ${offer.accountid_other}) is not the buyer (accountid ${buyerAccountId})`,
    );
  }

  // 2. The offer must be Accepted and expose a tradeid.
  if (offer.trade_offer_state !== ETradeOfferState.Accepted) {
    return notDelivered(`trade offer is not accepted (trade_offer_state=${offer.trade_offer_state})`);
  }
  if (!offer.tradeid) return notDelivered("accepted trade offer is missing a tradeid");

  // 3. The offer must GIVE the exact listed asset — not a substituted junk skin (anti wrong-item).
  const offeredListed = (offer.items_to_give ?? []).find((a) => assetMatchesListed(a, listed));
  if (!offeredListed) {
    return notDelivered("trade offer does not give the exact listed asset (wrong item bound to the offer)");
  }

  // 4. The trade status must exist, be the one this offer produced, and be with the buyer.
  if (!trade) return notDelivered("no completed trade found for the accepted offer");
  if (trade.tradeid !== offer.tradeid) {
    return notDelivered(`trade status id (${trade.tradeid}) does not match the offer tradeid (${offer.tradeid})`);
  }
  if (trade.steamid_other !== buyerSteamId64) {
    return notDelivered(`trade counterparty (${trade.steamid_other}) is not the buyer (${buyerSteamId64})`);
  }

  // 5. The trade must be COMPLETE. Anything less (in-progress / in-escrow) → not delivered yet.
  if (trade.status !== ETradeStatus.Complete) {
    return notDelivered(`trade is not complete (status=${trade.status})`);
  }

  // 6. Read the buyer-side `new_assetid` of the listed asset the seller gave.
  const givenListed = (trade.assets_given ?? []).find((a) => assetMatchesListed(a, listed));
  if (!givenListed) return notDelivered("completed trade did not give the listed asset");
  // From here on the trade demonstrably moved the exact listed asset to the buyer — failures below
  // are corroboration gaps, not non-delivery, so they carry tradeCompleted=true (dispute, not refund).
  const newAssetId = givenListed.new_assetid;
  if (!newAssetId) return notDelivered("completed trade has no new_assetid for the listed asset", true);

  // 7. Corroborate with the buyer's live inventory + dedup against sibling orders.
  const buyerCopies = assetIdsForClass(buyerInventoryNow, listed.classid, listed.instanceid);
  if (!buyerCopies.has(newAssetId)) {
    return notDelivered(`correlated asset ${newAssetId} is not yet visible in the buyer's inventory`, true);
  }
  if (excludeAssetIds?.has(newAssetId)) {
    return notDelivered(`correlated asset ${newAssetId} is already claimed by a sibling order`, true);
  }

  return { delivered: true, deliveredAssetId: newAssetId, tradeCompleted: true, reason: "correlated delivery confirmed" };
}

export interface DisappearanceEvidence {
  /** true = a copy of the skin is currently in the seller's inventory; null = couldn't check. */
  returnedToSeller: boolean | null;
  note: string;
}

/**
 * When a delivered copy vanishes from the buyer's inventory during the protection hold, s&box has NO
 * Valve reversal so we never auto-refund — the order routes to DISPUTE. This records whether the
 * skin is now back in the SELLER's inventory purely to help the operator resolve (buyer re-traded it
 * onward vs some Steam Support action). Evidence only — never an automatic trigger.
 */
export function classifyHoldDisappearance(
  sellerInventory: readonly SteamAsset[] | null,
  classid: string,
  instanceid: string,
): DisappearanceEvidence {
  if (!sellerInventory) {
    return { returnedToSeller: null, note: "seller inventory unavailable — could not check for return-to-seller" };
  }
  const present = assetIdsForClass(sellerInventory, classid, instanceid).size > 0;
  return present
    ? { returnedToSeller: true, note: "a copy of the listed skin is currently in the seller's inventory" }
    : {
        returnedToSeller: false,
        note: "the listed skin is not in the seller's inventory (buyer likely traded it onward)",
      };
}
