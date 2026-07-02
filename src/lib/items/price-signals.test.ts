import { describe, it, expect } from "vitest";
import { analyzeSignals } from "./price-signals";
import type { ItemDetailData } from "@/components/items/item-detail";

function item(over: Partial<ItemDetailData> = {}): ItemDetailData {
  return {
    id: "i",
    name: "Test Skin",
    slug: "test-skin",
    description: null,
    type: "clothing",
    imageUrl: null,
    marketUrl: null,
    steamMarketId: null,
    sboxFullIdent: null,
    currentPrice: 10,
    lowestPrice: null,
    medianPrice: null,
    volume: 0,
    totalSupply: 1000,
    priceChange24h: 0,
    isLimited: false,
    storeStatus: "delisted",
    delistedAt: null,
    storePrice: null,
    priceHistory: [],
    releaseDate: null,
    releasePrice: null,
    uniqueOwners: null,
    soldPast24h: null,
    supplyOnMarket: null,
    totalSales: null,
    scarcityScore: null,
    isActiveStoreItem: false,
    isPermanentStoreItem: false,
    leavingStoreAt: null,
    itemDisplayName: null,
    category: null,
    itemSubType: null,
    priceChange6h: null,
    priceChange6hPercent: null,
    topHolders: null,
    rarityColor: null,
    isDroppableItem: false,
    droppedUnits: null,
    rarity: null,
    ...over,
  };
}

const labels = (it: ItemDetailData, now?: number) => analyzeSignals(it, now).map((s) => s.label);

describe("analyzeSignals — item drop vs delisted (the bug)", () => {
  it("a drop shows 'Item drop', NOT 'Delisted from store'", () => {
    const l = labels(item({ isDroppableItem: true, droppedUnits: 42, storeStatus: "delisted" }));
    expect(l).toContain("Item drop");
    expect(l).not.toContain("Delisted from store");
  });

  it("a genuinely delisted store item still shows 'Delisted from store'", () => {
    const l = labels(item({ isDroppableItem: false, storeStatus: "delisted" }));
    expect(l).toContain("Delisted from store");
    expect(l).not.toContain("Item drop");
  });

  it("the drop signal reports the dropped-units count when known", () => {
    const sig = analyzeSignals(item({ isDroppableItem: true, droppedUnits: 42 })).find(
      (s) => s.label === "Item drop",
    );
    expect(sig?.description).toContain("42");
  });
});

describe("analyzeSignals — new signals", () => {
  it("high scarcity score", () => {
    expect(labels(item({ scarcityScore: 88 }))).toContain("High scarcity score");
  });

  it("6-hour surge and dip", () => {
    expect(labels(item({ priceChange6hPercent: 12 }))).toContain("6-hour surge");
    expect(labels(item({ priceChange6hPercent: -12 }))).toContain("6-hour dip");
  });

  it("sales velocity: active vs illiquid", () => {
    expect(labels(item({ totalSupply: 1000, soldPast24h: 80 }))).toContain("Active trading");
    expect(labels(item({ totalSupply: 1000, soldPast24h: 0 }))).toContain("Illiquid");
  });

  it("concentrated ownership when units-per-owner is high", () => {
    expect(labels(item({ totalSupply: 1000, uniqueOwners: 100 }))).toContain("Concentrated ownership");
  });

  it("high rarity tier", () => {
    expect(labels(item({ rarity: "legendary" }))).toContain("Legendary rarity");
    expect(labels(item({ rarity: "common" }))).not.toContain("Common rarity");
  });

  it("recently released within 14 days", () => {
    const now = Date.UTC(2026, 6, 1);
    const released = new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString();
    expect(labels(item({ releaseDate: released }), now)).toContain("Recently released");
  });

  it("near all-time low", () => {
    const history = Array.from({ length: 12 }, (_, i) => ({
      id: String(i),
      price: 10 + i, // min is 10
      volume: null,
      timestamp: new Date(Date.UTC(2026, 5, i + 1)).toISOString(),
    }));
    expect(labels(item({ currentPrice: 10, priceHistory: history }))).toContain("Near all-time low");
  });
});
