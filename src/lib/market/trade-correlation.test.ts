import { describe, it, expect } from "vitest";
import {
  correlateDelivery,
  classifyHoldDisappearance,
  ETradeStatus,
  type ListedAsset,
  type TradeOffer,
  type TradeStatus,
} from "./trade-correlation";
import type { SteamAsset } from "./item-match";
import offerAcceptedFixture from "./__fixtures__/get-trade-offer.accepted.json";
import tradeCompleteFixture from "./__fixtures__/get-trade-status.complete.json";

// The scenario the fixtures encode: buyer 76561198000000000 (32-bit accountid 39734272) bought the
// exact copy assetid 11111111111 (class 9876543210 / instance 0); the seller's accepted+completed
// offer 4444444444 (tradeid 7777777777) gave it, and it now sits in the buyer's inventory as the new
// assetid 22222222222.
const BUYER_STEAMID = "76561198000000000";

const listed: ListedAsset = {
  appid: 590830,
  contextid: "2",
  steamAssetId: "11111111111",
  classid: "9876543210",
  instanceid: "0",
};

const asset = (assetid: string, classid = listed.classid, instanceid = listed.instanceid): SteamAsset => ({
  assetid,
  classid,
  instanceid,
});

// Deep clone so per-test tweaks never mutate the shared fixture.
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const loadOffer = (): TradeOffer => clone(offerAcceptedFixture.response.offer) as TradeOffer;
const loadTrade = (): TradeStatus => clone(tradeCompleteFixture.response.trades[0]) as TradeStatus;

// Buyer inventory holding the correlated delivered copy (the new_assetid from the completed trade).
const deliveredInventory = (): SteamAsset[] => [asset("22222222222")];

describe("correlateDelivery — happy path", () => {
  it("confirms delivery with the buyer-side new_assetid when every link holds", () => {
    const r = correlateDelivery({
      offer: loadOffer(),
      trade: loadTrade(),
      listed,
      buyerSteamId64: BUYER_STEAMID,
      buyerInventoryNow: deliveredInventory(),
    });
    expect(r).toEqual({
      delivered: true,
      deliveredAssetId: "22222222222",
      tradeCompleted: true,
      reason: "correlated delivery confirmed",
    });
  });
});

describe("correlateDelivery — wrong-copy latch (review HIGH)", () => {
  it("does NOT credit a same-skin copy that arrived from a different seller", () => {
    // The buyer's inventory gained a NEW copy (99999999999) of the same class — but from someone
    // else, not this seller's trade. The class-fungible delta would latch it; correlation refuses
    // because the copy this seller actually gave (22222222222) is not present.
    const r = correlateDelivery({
      offer: loadOffer(),
      trade: loadTrade(),
      listed,
      buyerSteamId64: BUYER_STEAMID,
      buyerInventoryNow: [asset("99999999999")],
    });
    expect(r.delivered).toBe(false);
    expect(r.deliveredAssetId).toBeNull();
    expect(r.reason).toContain("22222222222");
    // The trade DID complete — only corroboration failed. This must dispute (not refund) at the SLA.
    expect(r.tradeCompleted).toBe(true);
  });

  it("rejects an offer whose partner is not the buyer", () => {
    const offer = loadOffer();
    offer.accountid_other = 12345; // some other account
    const r = correlateDelivery({
      offer,
      trade: loadTrade(),
      listed,
      buyerSteamId64: BUYER_STEAMID,
      buyerInventoryNow: deliveredInventory(),
    });
    expect(r.delivered).toBe(false);
    expect(r.reason).toContain("not the buyer");
  });

  it("rejects an offer that gives a different (junk) asset than the listed one", () => {
    const offer = loadOffer();
    offer.items_to_give = [
      { appid: 590830, contextid: "2", assetid: "55555", classid: "1111", instanceid: "0", amount: "1" },
    ];
    const r = correlateDelivery({
      offer,
      trade: loadTrade(),
      listed,
      buyerSteamId64: BUYER_STEAMID,
      buyerInventoryNow: deliveredInventory(),
    });
    expect(r.delivered).toBe(false);
    expect(r.reason).toContain("wrong item bound");
  });

  it("rejects a trade whose counterparty is not the buyer", () => {
    const trade = loadTrade();
    trade.steamid_other = "76561198999999999";
    const r = correlateDelivery({
      offer: loadOffer(),
      trade,
      listed,
      buyerSteamId64: BUYER_STEAMID,
      buyerInventoryNow: deliveredInventory(),
    });
    expect(r.delivered).toBe(false);
    expect(r.reason).toContain("not the buyer");
  });
});

describe("correlateDelivery — accepted offer but trade not complete (→ hold)", () => {
  it("does not confirm while the trade is still in escrow", () => {
    const trade = loadTrade();
    trade.status = ETradeStatus.InEscrow;
    const r = correlateDelivery({
      offer: loadOffer(),
      trade,
      listed,
      buyerSteamId64: BUYER_STEAMID,
      buyerInventoryNow: deliveredInventory(),
    });
    expect(r.delivered).toBe(false);
    expect(r.reason).toContain("not complete");
    // Not complete yet → NOT tradeCompleted → an SLA lapse here refunds (seller never delivered).
    expect(r.tradeCompleted).toBe(false);
  });

  it("does not confirm when there is no trade status yet for the accepted offer", () => {
    const r = correlateDelivery({
      offer: loadOffer(),
      trade: null,
      listed,
      buyerSteamId64: BUYER_STEAMID,
      buyerInventoryNow: deliveredInventory(),
    });
    expect(r.delivered).toBe(false);
    expect(r.reason).toContain("no completed trade");
  });

  it("does not confirm while the offer is merely Active (not yet accepted)", () => {
    const offer = loadOffer();
    offer.trade_offer_state = 2; // Active
    const r = correlateDelivery({
      offer,
      trade: null,
      listed,
      buyerSteamId64: BUYER_STEAMID,
      buyerInventoryNow: deliveredInventory(),
    });
    expect(r.delivered).toBe(false);
    expect(r.reason).toContain("not accepted");
  });
});

describe("correlateDelivery — dedup + missing offer", () => {
  it("does not confirm when the correlated copy was already claimed by a sibling order", () => {
    const r = correlateDelivery({
      offer: loadOffer(),
      trade: loadTrade(),
      listed,
      buyerSteamId64: BUYER_STEAMID,
      buyerInventoryNow: deliveredInventory(),
      excludeAssetIds: new Set(["22222222222"]),
    });
    expect(r.delivered).toBe(false);
    expect(r.reason).toContain("already claimed");
    // The trade completed; the claim conflict is for the operator — dispute, never SLA-refund.
    expect(r.tradeCompleted).toBe(true);
  });

  it("does not confirm when there is no offer at all", () => {
    const r = correlateDelivery({
      offer: null,
      trade: null,
      listed,
      buyerSteamId64: BUYER_STEAMID,
      buyerInventoryNow: deliveredInventory(),
    });
    expect(r.delivered).toBe(false);
    expect(r.reason).toContain("no trade offer");
  });
});

describe("classifyHoldDisappearance (dispute evidence, never an auto-refund)", () => {
  it("flags return-to-seller when the skin is back in the seller's inventory", () => {
    const sellerInv = [asset("33333333333")]; // same class/instance, a different physical copy
    expect(classifyHoldDisappearance(sellerInv, listed.classid, listed.instanceid)).toEqual({
      returnedToSeller: true,
      note: expect.stringContaining("seller's inventory"),
    });
  });

  it("flags likely re-trade when the skin is not in the seller's inventory", () => {
    expect(classifyHoldDisappearance([], listed.classid, listed.instanceid)).toEqual({
      returnedToSeller: false,
      note: expect.stringContaining("traded it onward"),
    });
  });

  it("returns unknown when the seller inventory could not be read", () => {
    expect(classifyHoldDisappearance(null, listed.classid, listed.instanceid)).toEqual({
      returnedToSeller: null,
      note: expect.stringContaining("unavailable"),
    });
  });
});
