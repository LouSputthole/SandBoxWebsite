import { describe, it, expect, beforeEach, vi } from "vitest";

// ---------------------------------------------------------------------------
// delete-account talks only to Prisma (`@/lib/db`). We mock it with an in-memory
// fake (just the methods the service calls). `$transaction` invokes its callback
// with the same mock client, mirroring a real interactive transaction. Style
// mirrors order-service.test.ts (vi.hoisted store + vi.mock).
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

const h = vi.hoisted(() => {
  const store = {
    users: new Map<string, Row>(),
    sessions: new Map<string, Row>(),
    wallets: new Map<string, Row>(), // keyed by userId (UserWallet is 1:1)
    credentials: new Map<string, Row>(),
    watchlist: new Map<string, Row>(),
    priceAlerts: new Map<string, Row>(),
    notifications: new Map<string, Row>(),
    loginEvents: new Map<string, Row>(),
    tradeListings: new Map<string, Row>(),
    tradeComments: new Map<string, Row>(),
    orders: new Map<string, Row>(),
    listings: new Map<string, Row>(),
    bans: new Map<string, Row>(),
    seq: 0,
  };
  return { store };
});

vi.mock("@/lib/db", () => {
  const { store } = h;
  const clone = <T>(o: T): T => (o && typeof o === "object" ? { ...o } : o);

  // A generic userId-keyed hard delete (Session, UserWallet, …).
  const delByUser = (map: Map<string, Row>) => ({
    deleteMany: async ({ where }: { where: { userId: string } }) => {
      let count = 0;
      for (const [k, v] of map) {
        if (v.userId === where.userId) {
          map.delete(k);
          count++;
        }
      }
      return { count };
    },
  });

  const prisma: Record<string, unknown> = {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const u = store.users.get(where.id);
        if (!u) return null;
        const w = store.wallets.get(where.id);
        return clone({ ...u, wallet: w ? { address: w.address } : null });
      },
      update: async ({ where, data }: { where: { id: string }; data: Row }) => {
        const u = store.users.get(where.id);
        if (!u) throw new Error(`user ${where.id} not found`);
        Object.assign(u, data);
        return clone(u);
      },
    },
    session: delByUser(store.sessions),
    userWallet: delByUser(store.wallets),
    sellerSteamCredential: delByUser(store.credentials),
    watchlistItem: delByUser(store.watchlist),
    priceAlert: delByUser(store.priceAlerts),
    notification: delByUser(store.notifications),
    loginEvent: delByUser(store.loginEvents),
    tradeListing: delByUser(store.tradeListings),
    tradeComment: {
      updateMany: async ({
        where,
        data,
      }: {
        where: { userId: string; deletedAt?: null };
        data: Row;
      }) => {
        let count = 0;
        for (const c of store.tradeComments.values()) {
          if (c.userId !== where.userId) continue;
          if (where.deletedAt === null && c.deletedAt != null) continue;
          Object.assign(c, data);
          count++;
        }
        return { count };
      },
    },
    marketOrder: {
      count: async ({
        where,
      }: {
        where: { state?: { in?: string[] }; OR?: Array<{ buyerId?: string; sellerId?: string }> };
      }) => {
        const states = where.state?.in;
        const or = where.OR;
        return [...store.orders.values()].filter((o) => {
          if (states && !states.includes(o.state as string)) return false;
          if (or)
            return or.some(
              (c) =>
                (c.buyerId !== undefined && o.buyerId === c.buyerId) ||
                (c.sellerId !== undefined && o.sellerId === c.sellerId),
            );
          return true;
        }).length;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { buyerId?: string; sellerId?: string; state?: { in?: string[] } };
        data: Row;
      }) => {
        const states = where.state?.in;
        let count = 0;
        for (const o of store.orders.values()) {
          const partyMatch =
            (where.buyerId !== undefined && o.buyerId === where.buyerId) ||
            (where.sellerId !== undefined && o.sellerId === where.sellerId);
          if (!partyMatch) continue;
          if (states && !states.includes(o.state as string)) continue;
          Object.assign(o, data);
          count++;
        }
        return { count };
      },
    },
    marketListing: {
      count: async ({ where }: { where: { sellerId: string; status: string } }) =>
        [...store.listings.values()].filter(
          (l) => l.sellerId === where.sellerId && l.status === where.status,
        ).length,
    },
    marketBan: {
      count: async ({
        where,
      }: {
        where: { OR?: Array<{ steamId?: string; walletAddress?: string }> };
      }) => {
        const or = where.OR ?? [];
        return [...store.bans.values()].filter((b) =>
          or.some(
            (c) =>
              (c.steamId !== undefined && b.steamId === c.steamId) ||
              (c.walletAddress !== undefined && b.walletAddress === c.walletAddress),
          ),
        ).length;
      },
    },
  };
  prisma.$transaction = async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma);
  return { prisma };
});

import { deleteAccount, AccountDeletionBlockedError } from "./delete-account";

// --- fixtures ----------------------------------------------------------------

const USER_ID = "u1";
const STEAM_ID = "76561198000000001";
const WALLET = "BUYER_WALLET_ADDR";
const OTHER = "other-user";

function seedUser(over: Partial<Row> = {}): string {
  const id = (over.id as string) ?? USER_ID;
  h.store.users.set(id, {
    id,
    steamId: (over.steamId as string) ?? STEAM_ID,
    username: "Tester",
    avatarUrl: "https://avatars/x.jpg",
    profileUrl: "https://steamcommunity.com/id/tester",
    steamTradeUrl: "https://steamcommunity.com/tradeoffer/new/?partner=1&token=abc",
    deletedAt: null,
    ...over,
  });
  return id;
}

function seedWallet(userId = USER_ID, address = WALLET) {
  h.store.wallets.set(userId, { userId, address });
}

function seedOrder(over: Partial<Row>): string {
  const id = (over.id as string) ?? `order-${++h.store.seq}`;
  h.store.orders.set(id, {
    id,
    buyerId: OTHER,
    sellerId: OTHER,
    state: "RELEASED",
    buyerPublic: true,
    sellerPublic: true,
    ...over,
  });
  return id;
}

beforeEach(() => {
  const s = h.store;
  for (const m of [
    s.users, s.sessions, s.wallets, s.credentials, s.watchlist, s.priceAlerts,
    s.notifications, s.loginEvents, s.tradeListings, s.tradeComments, s.orders,
    s.listings, s.bans,
  ]) {
    m.clear();
  }
  s.seq = 0;
});

// --- escrow-safety guard -----------------------------------------------------

describe("deleteAccount escrow-safety guard", () => {
  it("blocks when the user has a live (FUNDED) order as BUYER — and writes nothing", async () => {
    seedUser();
    seedOrder({ buyerId: USER_ID, state: "FUNDED" });
    await expect(deleteAccount(USER_ID)).rejects.toBeInstanceOf(AccountDeletionBlockedError);
    // Untouched: the row is not tombstoned.
    expect(h.store.users.get(USER_ID)!.steamId).toBe(STEAM_ID);
    expect(h.store.users.get(USER_ID)!.deletedAt).toBeNull();
  });

  it("blocks when the user has a live (FUNDED) order as SELLER", async () => {
    seedUser();
    seedOrder({ sellerId: USER_ID, state: "FUNDED" });
    await expect(deleteAccount(USER_ID)).rejects.toBeInstanceOf(AccountDeletionBlockedError);
    expect(h.store.users.get(USER_ID)!.steamId).toBe(STEAM_ID);
  });

  it("blocks when the user has an ACTIVE listing", async () => {
    seedUser();
    h.store.listings.set("l1", { id: "l1", sellerId: USER_ID, status: "ACTIVE" });
    const err = await deleteAccount(USER_ID).catch((e) => e);
    expect(err).toBeInstanceOf(AccountDeletionBlockedError);
    expect((err as AccountDeletionBlockedError).message).toMatch(/1 active listing/);
    expect(h.store.users.get(USER_ID)!.steamId).toBe(STEAM_ID);
  });

  it("does NOT block on completed (RELEASED/REFUNDED) orders — those are retained, not live", async () => {
    seedUser();
    seedOrder({ buyerId: USER_ID, state: "RELEASED" });
    seedOrder({ sellerId: USER_ID, state: "REFUNDED" });
    await expect(deleteAccount(USER_ID)).resolves.toBeDefined();
  });
});

// --- happy path --------------------------------------------------------------

describe("deleteAccount happy path", () => {
  it("hard-deletes children, soft-deletes trade comments, anonymizes the User + flips order privacy", async () => {
    seedUser();
    seedWallet();
    h.store.sessions.set("s1", { id: "s1", userId: USER_ID });
    h.store.sessions.set("s2", { id: "s2", userId: USER_ID });
    h.store.credentials.set("c1", { id: "c1", userId: USER_ID, encryptedApiKey: "secret" });
    h.store.watchlist.set("w1", { id: "w1", userId: USER_ID });
    h.store.priceAlerts.set("pa1", { id: "pa1", userId: USER_ID });
    h.store.notifications.set("n1", { id: "n1", userId: USER_ID });
    h.store.loginEvents.set("le1", { id: "le1", userId: USER_ID, ipHash: "abc" });
    h.store.tradeListings.set("tl1", { id: "tl1", userId: USER_ID });
    h.store.tradeComments.set("tc1", { id: "tc1", userId: USER_ID, deletedAt: null, deletedBy: null });
    const buyerOrder = seedOrder({ buyerId: USER_ID, state: "RELEASED", buyerPublic: true });
    const sellerOrder = seedOrder({ sellerId: USER_ID, state: "REFUNDED", sellerPublic: true });

    const summary = await deleteAccount(USER_ID);

    // Hard-delete counts.
    expect(summary.deleted.sessions).toBe(2);
    expect(summary.deleted.userWallets).toBe(1);
    expect(summary.deleted.sellerCredentials).toBe(1);
    expect(summary.deleted.watchlistItems).toBe(1);
    expect(summary.deleted.priceAlerts).toBe(1);
    expect(summary.deleted.notifications).toBe(1);
    expect(summary.deleted.loginEvents).toBe(1);
    expect(summary.deleted.tradeListings).toBe(1);
    expect(summary.deleted.tradeCommentsSoftDeleted).toBe(1);
    expect(summary.anonymizedOrders).toBe(2);

    // Rows actually gone.
    expect(h.store.sessions.size).toBe(0);
    expect(h.store.wallets.size).toBe(0);
    expect(h.store.credentials.size).toBe(0);
    expect(h.store.tradeListings.size).toBe(0);

    // Trade comment SOFT-deleted (row survives, deletedAt/deletedBy set).
    const tc = h.store.tradeComments.get("tc1")!;
    expect(h.store.tradeComments.size).toBe(1);
    expect(tc.deletedAt).toBeInstanceOf(Date);
    expect(tc.deletedBy).toBe("account-deletion");

    // Orders anonymized (privacy flag flipped for the deleting party only).
    expect(h.store.orders.get(buyerOrder)!.buyerPublic).toBe(false);
    expect(h.store.orders.get(sellerOrder)!.sellerPublic).toBe(false);

    // User row tombstoned — no PII, unique steamId freed for a fresh future login.
    const u = h.store.users.get(USER_ID)!;
    expect(u.steamId).toBe(`deleted:${USER_ID}`);
    expect(u.username).toBeNull();
    expect(u.avatarUrl).toBeNull();
    expect(u.profileUrl).toBeNull();
    expect(u.steamTradeUrl).toBeNull();
    expect(u.deletedAt).toBeInstanceOf(Date);
  });

  it("throws when the user does not exist", async () => {
    await expect(deleteAccount("ghost")).rejects.toThrow(/user not found/);
  });
});

// --- ban retention -----------------------------------------------------------

describe("deleteAccount ban retention", () => {
  it("does NOT delete a MarketBan matching the user's steamId or wallet, and reports it in the summary", async () => {
    seedUser();
    seedWallet();
    h.store.bans.set("b1", { id: "b1", steamId: STEAM_ID, walletAddress: null, liftedAt: null });
    h.store.bans.set("b2", { id: "b2", steamId: null, walletAddress: WALLET, liftedAt: null });

    const summary = await deleteAccount(USER_ID);

    // Bans survive (the service exposes no delete on MarketBan) and are counted.
    expect(h.store.bans.size).toBe(2);
    expect(summary.retainedBans).toBe(2);
  });
});
