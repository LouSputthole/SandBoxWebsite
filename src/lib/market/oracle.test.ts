import { describe, it, expect } from "vitest";
import { checkDelivery, checkHold } from "./oracle";
import type { SteamAsset } from "./item-match";

const a = (assetid: string, classid = "C1", instanceid = "I1"): SteamAsset => ({
  assetid,
  classid,
  instanceid,
});

describe("checkDelivery", () => {
  it("reports delivered with the new assetid when the item arrives", () => {
    const before = [a("A1")];
    const now = [a("A1"), a("A2")];
    expect(checkDelivery(before, now, "C1", "I1")).toEqual({
      status: "delivered",
      deliveredAssetId: "A2",
    });
  });

  it("reports pending when nothing new of the class arrived", () => {
    expect(checkDelivery([a("A1")], [a("A1")], "C1", "I1")).toEqual({
      status: "pending",
      deliveredAssetId: null,
    });
  });
});

describe("checkHold", () => {
  const protectionUntil = 10_000;

  it("hold while the copy is present and the window hasn't elapsed", () => {
    expect(checkHold([a("A2")], "A2", protectionUntil, 9_000)).toBe("hold");
  });

  it("releasable once present and the window elapses", () => {
    expect(checkHold([a("A2")], "A2", protectionUntil, 10_000)).toBe("releasable");
  });

  it("vanished if the delivered copy left the inventory (even after the window)", () => {
    expect(checkHold([], "A2", protectionUntil, 99_999)).toBe("vanished");
    expect(checkHold([a("A3")], "A2", protectionUntil, 99_999)).toBe("vanished");
  });
});
