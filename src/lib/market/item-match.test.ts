import { describe, it, expect } from "vitest";
import {
  detectDelivery,
  assetStillPresent,
  assetIdsForClass,
  type SteamAsset,
} from "./item-match";

const asset = (assetid: string, classid = "C1", instanceid = "I1"): SteamAsset => ({
  assetid,
  classid,
  instanceid,
});

describe("detectDelivery", () => {
  it("detects the exact item arriving in an empty-of-that-class inventory", () => {
    const before: SteamAsset[] = [];
    const after = [asset("A100")];
    expect(detectDelivery(before, after, "C1", "I1")).toEqual({
      delivered: true,
      deliveredAssetId: "A100",
    });
  });

  it("detects a NEW copy even when the buyer already owned identical copies", () => {
    const before = [asset("A1"), asset("A2")];
    const after = [asset("A1"), asset("A2"), asset("A3")]; // A3 is the delivered one
    expect(detectDelivery(before, after, "C1", "I1")).toEqual({
      delivered: true,
      deliveredAssetId: "A3",
    });
  });

  it("does NOT fire when nothing new of the class arrived", () => {
    const before = [asset("A1")];
    const after = [asset("A1")];
    expect(detectDelivery(before, after, "C1", "I1").delivered).toBe(false);
  });

  it("does NOT fire for a different skin arriving (wrong class → anti-junk-send)", () => {
    const before: SteamAsset[] = [];
    const after = [asset("A9", "OTHER", "I1")];
    expect(detectDelivery(before, after, "C1", "I1").delivered).toBe(false);
  });

  it("distinguishes instanceid within the same classid", () => {
    const before: SteamAsset[] = [];
    const after = [asset("A9", "C1", "I2")];
    expect(detectDelivery(before, after, "C1", "I1").delivered).toBe(false);
  });

  it("skips an assetid already claimed by a sibling order, picking the next new copy", () => {
    const before = [asset("A1")];
    const after = [asset("A1"), asset("A2"), asset("A3")];
    expect(detectDelivery(before, after, "C1", "I1", new Set(["A2"]))).toEqual({
      delivered: true,
      deliveredAssetId: "A3",
    });
  });

  it("is not-delivered when the only new copy is already claimed (anti double-pay)", () => {
    const before = [asset("A1")];
    const after = [asset("A1"), asset("A2")];
    expect(detectDelivery(before, after, "C1", "I1", new Set(["A2"])).delivered).toBe(false);
  });
});

describe("assetStillPresent (reversal check)", () => {
  it("true while the delivered copy is held, false once reversed away", () => {
    const held = [asset("A3")];
    expect(assetStillPresent(held, "A3")).toBe(true);
    expect(assetStillPresent([], "A3")).toBe(false);
  });
});

describe("assetIdsForClass", () => {
  it("collects only matching class/instance", () => {
    const inv = [asset("A1"), asset("A2", "C2"), asset("A3")];
    expect(assetIdsForClass(inv, "C1", "I1")).toEqual(new Set(["A1", "A3"]));
  });
});
