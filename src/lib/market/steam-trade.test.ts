import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchTradeOffer, fetchTradeStatus, SteamTradeUnavailableError } from "./steam-trade";
import offerAcceptedFixture from "./__fixtures__/get-trade-offer.accepted.json";
import tradeCompleteFixture from "./__fixtures__/get-trade-status.complete.json";

/** Mock global fetch with a text() body (steam-trade reads text, then JSON.parses it). */
function mockFetch(status: number, body: unknown, opts: { asText?: string } = {}) {
  const text = opts.asText ?? JSON.stringify(body);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status, text: async () => text }),
  );
}

const API_KEY = "A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4";

describe("fetchTradeOffer — fail closed on transient/transport failures", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns the parsed offer on a clean response", async () => {
    mockFetch(200, offerAcceptedFixture);
    const offer = await fetchTradeOffer(API_KEY, "4444444444");
    expect(offer).toMatchObject({ tradeofferid: "4444444444", trade_offer_state: 3, tradeid: "7777777777" });
  });

  it("returns null when the envelope is valid but the offer is not found", async () => {
    mockFetch(200, { response: {} });
    await expect(fetchTradeOffer(API_KEY, "0")).resolves.toBeNull();
  });

  it("throws on a 500 (Steam down / bad offer id)", async () => {
    mockFetch(500, {});
    await expect(fetchTradeOffer(API_KEY, "4444444444")).rejects.toBeInstanceOf(SteamTradeUnavailableError);
  });

  it("throws on a 429 rate limit", async () => {
    mockFetch(429, {});
    await expect(fetchTradeOffer(API_KEY, "4444444444")).rejects.toBeInstanceOf(SteamTradeUnavailableError);
  });

  it("throws when Steam serves an HTML challenge page with a 200", async () => {
    mockFetch(200, null, { asText: "<!DOCTYPE html><html><body>error</body></html>" });
    await expect(fetchTradeOffer(API_KEY, "4444444444")).rejects.toBeInstanceOf(SteamTradeUnavailableError);
  });

  it("throws when the response envelope is missing entirely", async () => {
    mockFetch(200, { something_else: true });
    await expect(fetchTradeOffer(API_KEY, "4444444444")).rejects.toBeInstanceOf(SteamTradeUnavailableError);
  });

  it("throws when fetch itself rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNRESET")));
    await expect(fetchTradeOffer(API_KEY, "4444444444")).rejects.toBeInstanceOf(SteamTradeUnavailableError);
  });
});

describe("fetchTradeStatus — fail closed", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns the parsed trades array on a clean response", async () => {
    mockFetch(200, tradeCompleteFixture);
    const trades = await fetchTradeStatus(API_KEY, "7777777777");
    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({ tradeid: "7777777777", status: 3 });
    expect(trades[0].assets_given?.[0]).toMatchObject({ assetid: "11111111111", new_assetid: "22222222222" });
  });

  it("returns [] when the envelope has no trades", async () => {
    mockFetch(200, { response: {} });
    await expect(fetchTradeStatus(API_KEY, "7777777777")).resolves.toEqual([]);
  });

  it("throws on a non-2xx", async () => {
    mockFetch(503, {});
    await expect(fetchTradeStatus(API_KEY, "7777777777")).rejects.toBeInstanceOf(SteamTradeUnavailableError);
  });

  it("throws when the response envelope is missing", async () => {
    mockFetch(200, { nope: 1 });
    await expect(fetchTradeStatus(API_KEY, "7777777777")).rejects.toBeInstanceOf(SteamTradeUnavailableError);
  });
});
