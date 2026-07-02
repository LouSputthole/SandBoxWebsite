import { describe, it, expect, beforeEach, vi } from "vitest";

// ---------------------------------------------------------------------------
// listing-service talks only to Prisma (`@/lib/db`). Mocked with an in-memory fake exercising the
// createListing ban gate + readiness checks. marketBan.findFirst matches the { liftedAt: null,
// OR: [{steamId},{walletAddress}] } query assertNotBanned builds against a seedable bans store.
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

const h = vi.hoisted(() => ({
  store: {
    wallets: new Map<string, Row>(),
    creds: new Map<string, Row>(),
    users: new Map<string, Row>(),
    bans: new Map<string, Row>(),
    liveOrders: [] as Row[],
    listings: [] as Row[],
    seq: 0,
  },
}));

vi.mock("@/lib/db", () => {
  const { store } = h;
  const clone = <T>(o: T): T => (o && typeof o === "object" ? { ...o } : o);
  const prisma = {
    userWallet: {
      findUnique: async ({ where }: { where: { userId: string } }) => clone(store.wallets.get(where.userId) ?? null),
    },
    sellerSteamCredential: {
      findUnique: async ({ where }: { where: { userId: string } }) => clone(store.creds.get(where.userId) ?? null),
    },
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => clone(store.users.get(where.id) ?? null),
    },
    marketBan: {
      findFirst: async ({ where }: { where?: { liftedAt?: null; OR?: Array<{ steamId?: string; walletAddress?: string }> } } = {}) => {
        const or = where?.OR ?? [];
        const hit = [...store.bans.values()].find(
          (b) =>
            b.liftedAt == null &&
            or.some(
              (c) =>
                (c.steamId !== undefined && b.steamId === c.steamId) ||
                (c.walletAddress !== undefined && b.walletAddress === c.walletAddress),
            ),
        );
        return clone(hit ?? null);
      },
    },
    marketOrder: {
      findFirst: async () => clone(store.liveOrders[0] ?? null),
    },
    marketListing: {
      create: async ({ data }: { data: Row }) => {
        const row = { id: `listing-${++store.seq}`, ...data };
        store.listings.push(row);
        return clone(row);
      },
    },
  };
  return { prisma };
});

import { createListing } from "./listing-service";
import { MarketBannedError } from "./bans";

const SELLER_ID = "seller-1";
const STEAM = "76561198000000000";
const WALLET = "So11111111111111111111111111111111111111112";

/** Seed a fully ready, unbanned seller. */
function seedReadySeller() {
  h.store.users.set(SELLER_ID, { id: SELLER_ID, steamId: STEAM });
  h.store.wallets.set(SELLER_ID, { userId: SELLER_ID, address: WALLET });
  h.store.creds.set(SELLER_ID, { userId: SELLER_ID, mobileAuthConfirmed: true });
}

const listingInput = () => ({
  sellerId: SELLER_ID,
  itemId: "item-1",
  steamAssetId: "asset-1",
  classId: "class-1",
  instanceId: "0",
  priceUsd: 10,
});

beforeEach(() => {
  h.store.wallets.clear();
  h.store.creds.clear();
  h.store.users.clear();
  h.store.bans.clear();
  h.store.liveOrders = [];
  h.store.listings = [];
  h.store.seq = 0;
});

describe("createListing ban enforcement", () => {
  it("a ready, unbanned seller can create a listing", async () => {
    seedReadySeller();
    const listing = await createListing(listingInput());
    expect(listing.status).toBe("ACTIVE");
    expect(h.store.listings).toHaveLength(1);
  });

  it("blocks a banned seller (by steamId) with the generic message and creates no listing", async () => {
    seedReadySeller();
    h.store.bans.set("b1", { id: "b1", steamId: STEAM, walletAddress: null, liftedAt: null });
    await expect(createListing(listingInput())).rejects.toThrow(/cannot use the marketplace/);
    // Propagates the typed MarketBannedError; the listings route maps it to 403 (never echoes reason).
    await expect(createListing(listingInput())).rejects.toBeInstanceOf(MarketBannedError);
    expect(h.store.listings).toHaveLength(0);
  });

  it("blocks a banned wallet even when the steamId is clean", async () => {
    seedReadySeller();
    h.store.bans.set("b1", { id: "b1", steamId: null, walletAddress: WALLET, liftedAt: null });
    await expect(createListing(listingInput())).rejects.toThrow(/cannot use the marketplace/);
    expect(h.store.listings).toHaveLength(0);
  });

  it("wins over the readiness errors — a banned seller with no wallet still gets the ban message", async () => {
    // Only the user row (steamId) exists; no wallet/cred. Ban gate runs before the readiness checks.
    h.store.users.set(SELLER_ID, { id: SELLER_ID, steamId: STEAM });
    h.store.bans.set("b1", { id: "b1", steamId: STEAM, walletAddress: null, liftedAt: null });
    await expect(createListing(listingInput())).rejects.toThrow(/cannot use the marketplace/);
  });

  it("a lifted ban no longer blocks the seller", async () => {
    seedReadySeller();
    h.store.bans.set("b1", { id: "b1", steamId: STEAM, walletAddress: null, liftedAt: new Date() });
    const listing = await createListing(listingInput());
    expect(listing.status).toBe("ACTIVE");
  });
});
