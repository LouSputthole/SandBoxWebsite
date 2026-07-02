import { describe, it, expect, vi, afterEach } from "vitest";
import {
  parseInventory,
  parseInventoryItems,
  fetchPublicInventory,
  InventoryPrivateError,
  SteamInventoryUnavailableError,
  type RawInventoryResponse,
  type RawInventoryFull,
} from "./steam-inventory";

function mockFetch(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status, json: async () => body }),
  );
}

describe("parseInventory", () => {
  it("maps assets to bare identity tuples", () => {
    const raw: RawInventoryResponse = {
      success: 1,
      assets: [
        { assetid: "A1", classid: "C1", instanceid: "I1", amount: "1" },
        { assetid: "A2", classid: "C2", instanceid: "0" },
      ],
    };
    expect(parseInventory(raw)).toEqual([
      { assetid: "A1", classid: "C1", instanceid: "I1", amount: "1" },
      { assetid: "A2", classid: "C2", instanceid: "0", amount: undefined },
    ]);
  });

  it("returns [] for an empty/assetless inventory", () => {
    expect(parseInventory({ success: 1 })).toEqual([]);
    expect(parseInventory({ success: 1, assets: [] })).toEqual([]);
  });
});

describe("parseInventoryItems", () => {
  const raw: RawInventoryFull = {
    success: 1,
    assets: [
      { assetid: "A1", classid: "C1", instanceid: "I1" },
      { assetid: "A2", classid: "C2", instanceid: "0" },
      { assetid: "A3", classid: "CX", instanceid: "0" }, // no matching description → skipped
    ],
    descriptions: [
      { classid: "C1", instanceid: "I1", name: "Cool Hat", icon_url: "abc", tradable: 1, marketable: 1 },
      { classid: "C2", instanceid: "0", market_hash_name: "Plain Tee", tradable: 0, marketable: 0 },
    ],
  };

  it("joins assets to descriptions with names, art, and trade flags", () => {
    const items = parseInventoryItems(raw);
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      assetId: "A1",
      classId: "C1",
      instanceId: "I1",
      name: "Cool Hat",
      imageUrl: "https://community.cloudflare.steamstatic.com/economy/image/abc",
      tradable: true,
      marketable: true,
    });
    expect(items[1]).toMatchObject({ name: "Plain Tee", tradable: false, marketable: false, imageUrl: null });
  });

  it("returns [] when descriptions are missing", () => {
    expect(parseInventoryItems({ assets: raw.assets })).toEqual([]);
  });
});

describe("fetchPublicInventory — fail closed on soft/transient errors (anti wrongful-refund)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("throws SteamInventoryUnavailableError on HTTP 200 with success !== 1", async () => {
    mockFetch(200, { success: 0 });
    await expect(fetchPublicInventory("7656")).rejects.toBeInstanceOf(SteamInventoryUnavailableError);
  });

  it("returns [] for a genuinely empty inventory (success:1, no assets)", async () => {
    mockFetch(200, { success: 1 });
    await expect(fetchPublicInventory("7656")).resolves.toEqual([]);
  });

  it("throws InventoryPrivateError on 403", async () => {
    mockFetch(403, {});
    await expect(fetchPublicInventory("7656")).rejects.toBeInstanceOf(InventoryPrivateError);
  });

  it("follows more_items pagination and concatenates all pages", async () => {
    const page1 = {
      success: 1,
      assets: [{ assetid: "A1", classid: "C1", instanceid: "I1" }],
      more_items: 1,
      last_assetid: "A1",
    };
    const page2 = { success: 1, assets: [{ assetid: "A2", classid: "C1", instanceid: "I1" }] };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => page1 })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => page2 });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchPublicInventory("7656")).resolves.toEqual([
      { assetid: "A1", classid: "C1", instanceid: "I1", amount: undefined },
      { assetid: "A2", classid: "C1", instanceid: "I1", amount: undefined },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
