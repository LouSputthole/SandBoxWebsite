import { describe, it, expect } from "vitest";
import {
  marketAccess,
  parseMarketOpen,
  parsePreviewSteamIds,
  makePreviewToken,
  verifyPreviewToken,
  MarketGatedError,
} from "./access";

const OWNER = "76561198000000001";
const OTHER = "76561198000000002";

describe("marketAccess", () => {
  it("marketOpen → open (public_open), regardless of anything else", () => {
    expect(
      marketAccess({
        marketOpen: true,
        previewSteamIds: new Set(),
        userSteamId: null,
        previewCookieValid: false,
      }),
    ).toEqual({ open: true, reason: "public_open" });
  });

  it("gated → open when the user's SteamID is on the allowlist (preview_steamid)", () => {
    expect(
      marketAccess({
        marketOpen: false,
        previewSteamIds: new Set([OWNER]),
        userSteamId: OWNER,
        previewCookieValid: false,
      }),
    ).toEqual({ open: true, reason: "preview_steamid" });
  });

  it("gated → open when a valid preview cookie is present (preview_cookie)", () => {
    expect(
      marketAccess({
        marketOpen: false,
        previewSteamIds: new Set([OWNER]),
        userSteamId: OTHER,
        previewCookieValid: true,
      }),
    ).toEqual({ open: true, reason: "preview_cookie" });
  });

  it("SteamID allowlist takes precedence over the cookie in the reason", () => {
    expect(
      marketAccess({
        marketOpen: false,
        previewSteamIds: new Set([OWNER]),
        userSteamId: OWNER,
        previewCookieValid: true,
      }),
    ).toEqual({ open: true, reason: "preview_steamid" });
  });

  it("gated → closed for a non-allowlisted user with no cookie", () => {
    expect(
      marketAccess({
        marketOpen: false,
        previewSteamIds: new Set([OWNER]),
        userSteamId: OTHER,
        previewCookieValid: false,
      }),
    ).toEqual({ open: false, reason: "gated" });
  });

  it("gated → closed with an empty allowlist and no cookie", () => {
    expect(
      marketAccess({
        marketOpen: false,
        previewSteamIds: new Set(),
        userSteamId: OWNER,
        previewCookieValid: false,
      }),
    ).toEqual({ open: false, reason: "gated" });
  });

  it("gated → closed when there is no signed-in user", () => {
    expect(
      marketAccess({
        marketOpen: false,
        previewSteamIds: new Set([OWNER]),
        userSteamId: null,
        previewCookieValid: false,
      }),
    ).toEqual({ open: false, reason: "gated" });
  });
});

describe("parseMarketOpen", () => {
  it("only the exact string \"true\" opens the market", () => {
    expect(parseMarketOpen("true")).toBe(true);
  });

  it("everything else is closed", () => {
    expect(parseMarketOpen("false")).toBe(false);
    expect(parseMarketOpen("TRUE")).toBe(false);
    expect(parseMarketOpen("1")).toBe(false);
    expect(parseMarketOpen("")).toBe(false);
    expect(parseMarketOpen(undefined)).toBe(false);
    expect(parseMarketOpen(null)).toBe(false);
  });
});

describe("parsePreviewSteamIds", () => {
  it("returns an empty set for missing/empty input", () => {
    expect(parsePreviewSteamIds(undefined).size).toBe(0);
    expect(parsePreviewSteamIds(null).size).toBe(0);
    expect(parsePreviewSteamIds("").size).toBe(0);
    expect(parsePreviewSteamIds("   ").size).toBe(0);
  });

  it("splits on commas", () => {
    expect([...parsePreviewSteamIds(`${OWNER},${OTHER}`)]).toEqual([OWNER, OTHER]);
  });

  it("splits on whitespace", () => {
    expect([...parsePreviewSteamIds(`${OWNER} ${OTHER}`)]).toEqual([OWNER, OTHER]);
  });

  it("tolerates trailing spaces, trailing commas, and mixed separators", () => {
    const set = parsePreviewSteamIds(`  ${OWNER} ,, ${OTHER},  `);
    expect(set.has(OWNER)).toBe(true);
    expect(set.has(OTHER)).toBe(true);
    expect(set.size).toBe(2);
  });

  it("dedupes repeated ids", () => {
    expect(parsePreviewSteamIds(`${OWNER}, ${OWNER}`).size).toBe(1);
  });
});

describe("preview token HMAC", () => {
  const KEY = "seCURE1776!";

  it("mints a stable, hex token for a given key + message", () => {
    const t1 = makePreviewToken(KEY);
    const t2 = makePreviewToken(KEY);
    expect(t1).toBe(t2);
    expect(t1).toMatch(/^[0-9a-f]{64}$/);
  });

  it("verifies a token minted with the same key", () => {
    expect(verifyPreviewToken(makePreviewToken(KEY), KEY)).toBe(true);
  });

  it("rejects a token minted with a different key (can't forge without the key)", () => {
    expect(verifyPreviewToken(makePreviewToken("other-key"), KEY)).toBe(false);
  });

  it("rejects a tampered token", () => {
    const token = makePreviewToken(KEY);
    const tampered = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;
    expect(verifyPreviewToken(tampered, KEY)).toBe(false);
  });

  it("rejects a token of the wrong length (no timingSafeEqual throw)", () => {
    expect(verifyPreviewToken("deadbeef", KEY)).toBe(false);
  });

  it("rejects missing token or missing secret", () => {
    expect(verifyPreviewToken(undefined, KEY)).toBe(false);
    expect(verifyPreviewToken(null, KEY)).toBe(false);
    expect(verifyPreviewToken("", KEY)).toBe(false);
    expect(verifyPreviewToken(makePreviewToken(KEY), undefined)).toBe(false);
    expect(verifyPreviewToken(makePreviewToken(KEY), "")).toBe(false);
  });
});

describe("MarketGatedError", () => {
  it("is an Error with a public-facing default message and a stable name", () => {
    const err = new MarketGatedError();
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("MarketGatedError");
    expect(err.message).toBe("The marketplace isn't open yet.");
  });
});
