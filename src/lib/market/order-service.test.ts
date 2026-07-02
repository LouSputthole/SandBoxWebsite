import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MockEscrowClient } from "./escrow/mock";
import { EscrowTxExpiredError, type OpenEscrowParams } from "./escrow/types";

// ---------------------------------------------------------------------------
// order-service talks to Prisma (`@/lib/db`) and the escrow client (`./escrow`).
// Both are mocked: an in-memory fake Prisma (just the methods the service calls) and a REAL
// MockEscrowClient (so the two-phase prepare/submit/refund/freeze logic is exercised end-to-end).
// fetchPublicInventory is stubbed so createOrder does no network I/O.
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

const h = vi.hoisted(() => {
  const store = {
    orders: new Map<string, Row>(),
    listings: new Map<string, Row>(),
    wallets: new Map<string, Row>(),
    bans: new Map<string, Row>(),
    seq: 0,
  };
  const escrowRef = { current: null as unknown };
  return { store, escrowRef };
});

vi.mock("@/lib/db", () => {
  const { store } = h;
  const clone = <T>(o: T): T => (o && typeof o === "object" ? { ...o } : o);
  const prisma = {
    marketListing: {
      findUnique: async ({ where }: { where: { id: string } }) => clone(store.listings.get(where.id) ?? null),
      update: async ({ where, data }: { where: { id: string }; data: Row }) => {
        const row = store.listings.get(where.id);
        if (!row) throw new Error(`listing ${where.id} not found`);
        Object.assign(row, data);
        return clone(row);
      },
    },
    userWallet: {
      findUnique: async ({ where }: { where: { userId: string } }) => clone(store.wallets.get(where.userId) ?? null),
    },
    marketOrder: {
      create: async ({ data }: { data: Row }) => {
        const id = (data.id as string) ?? `order-${++store.seq}`;
        const row: Row = {
          escrowPda: null,
          onchainOrderId: null,
          deliveredAssetId: null,
          protectionUntil: null,
          fundedAt: null,
          sellerSentAt: null,
          deliveredAt: null,
          protectionStartedAt: null,
          releasedAt: null,
          refundedAt: null,
          disputeReason: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
          id,
        };
        store.orders.set(id, row);
        return clone(row);
      },
      findUnique: async ({ where }: { where: { id: string } }) => clone(store.orders.get(where.id) ?? null),
      findMany: async ({
        where,
      }: {
        where?: { state?: string | { in?: string[] }; createdAt?: { lt?: Date } };
      }) => {
        let rows = [...store.orders.values()];
        if (typeof where?.state === "string") rows = rows.filter((r) => r.state === where.state);
        else if (where?.state?.in) rows = rows.filter((r) => (where.state as { in: string[] }).in.includes(r.state as string));
        if (where?.createdAt?.lt) rows = rows.filter((r) => (r.createdAt as Date) < where.createdAt!.lt!);
        return rows.map(clone);
      },
      update: async ({ where, data }: { where: { id: string }; data: Row }) => {
        const row = store.orders.get(where.id);
        if (!row) throw new Error(`order ${where.id} not found`);
        Object.assign(row, data);
        return clone(row);
      },
      // Conditional single-row write — the atomic PENDING→FUNDING claim / claim revert.
      updateMany: async ({ where, data }: { where: { id: string; state?: string }; data: Row }) => {
        const row = store.orders.get(where.id);
        if (!row || (where.state !== undefined && row.state !== where.state)) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
      delete: async ({ where }: { where: { id: string } }) => {
        const row = store.orders.get(where.id);
        store.orders.delete(where.id);
        return clone(row ?? {});
      },
      // Conditional delete — cancel/reap only remove the row if it's still in the state they read.
      deleteMany: async ({ where }: { where: { id: string; state?: string } }) => {
        const row = store.orders.get(where.id);
        if (!row || (where.state !== undefined && row.state !== where.state)) return { count: 0 };
        store.orders.delete(where.id);
        return { count: 1 };
      },
    },
    tradeAttempt: {
      // tickOrder's delivery correlation: no recorded trade offer → "seller hasn't sent yet".
      findFirst: async () => null,
      create: async ({ data }: { data: Row }) => ({ id: `attempt-${++store.seq}`, ...data }),
    },
    // Ban gate (bans.ts, via createOrder). Matches the { liftedAt: null, OR: [{steamId},{wallet}] }
    // query assertNotBanned builds against the seeded bans store — empty by default (clean pass).
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
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  };
  return { prisma };
});

vi.mock("./escrow", () => ({
  getEscrowClient: () => h.escrowRef.current,
  __resetEscrowClient: () => {},
}));

vi.mock("./steam-inventory", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./steam-inventory")>();
  return { ...actual, fetchPublicInventory: vi.fn(async () => []) };
});

import {
  FundingInProgressError,
  createOrder,
  fundOrder,
  cancelPendingOrder,
  expirePendingOrders,
  tickOrder,
} from "./order-service";

// --- fixtures ----------------------------------------------------------------

const BUYER_ID = "buyer-user";
const SELLER_ID = "seller-user";
const BUYER_ADDR = "BUYER_WALLET_ADDR";
const SELLER_ADDR = "SELLER_WALLET_ADDR";
const AMOUNT = BigInt(100_000_000); // 100 USDC

function escrow(): MockEscrowClient {
  return h.escrowRef.current as MockEscrowClient;
}

/** Seed a listing + both wallets. */
function seedListingAndWallets(listingId: string, steamAssetId: string) {
  h.store.listings.set(listingId, {
    id: listingId,
    sellerId: SELLER_ID,
    itemId: "item-1",
    status: "ACTIVE",
    priceUsd: 100,
    steamAssetId,
    classId: "class-1",
    instanceId: "0",
  });
  h.store.wallets.set(BUYER_ID, { userId: BUYER_ID, address: BUYER_ADDR });
  h.store.wallets.set(SELLER_ID, { userId: SELLER_ID, address: SELLER_ADDR });
}

/** Seed a PENDING order row directly (bypassing createOrder). */
function seedPendingOrder(over: Partial<Row> = {}): Row {
  const id = (over.id as string) ?? `order-${++h.store.seq}`;
  const listingId = (over.listingId as string) ?? `listing-${id}`;
  const steamAssetId = (over.steamAssetId as string) ?? `asset-${id}`;
  seedListingAndWallets(listingId, steamAssetId);
  const row: Row = {
    id,
    listingId,
    buyerId: BUYER_ID,
    sellerId: SELLER_ID,
    priceUsdc: AMOUNT,
    feeBps: 360,
    state: "PENDING",
    steamAssetId,
    classId: "class-1",
    instanceId: "0",
    buyerPriorAssetIds: [],
    deliveredAssetId: null,
    deliveryDeadline: new Date((Math.floor(Date.now() / 1000) + 3600) * 1000),
    protectionUntil: null,
    fundedAt: null,
    createdAt: new Date(),
    disputeReason: null,
    ...over,
  };
  h.store.orders.set(id, row);
  return row;
}

const openParams = (orderId: string, over: Partial<OpenEscrowParams> = {}): OpenEscrowParams => ({
  orderId,
  buyer: BUYER_ADDR,
  seller: SELLER_ADDR,
  amount: AMOUNT,
  feeBps: 360,
  deliveryDeadline: Math.floor(Date.now() / 1000) + 3600,
  ...over,
});

beforeEach(() => {
  h.store.orders.clear();
  h.store.listings.clear();
  h.store.wallets.clear();
  h.store.bans.clear();
  h.store.seq = 0;
  h.escrowRef.current = new MockEscrowClient();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// --- createOrder -------------------------------------------------------------

describe("createOrder", () => {
  it("creates a PENDING order (fundedAt null, listing still ACTIVE) and returns the open tx", async () => {
    seedListingAndWallets("listing-1", "asset-1");
    const { order, txBase64 } = await createOrder({
      listingId: "listing-1",
      buyerId: BUYER_ID,
      buyerSteamId64: "76500000000000000",
    });
    expect(order.state).toBe("PENDING");
    expect(order.fundedAt).toBeNull();
    expect(order.escrowPda).toBeNull();
    expect(txBase64).toBeNull(); // mock has nothing to sign
    expect(h.store.listings.get("listing-1")!.status).toBe("ACTIVE");
    expect(h.store.orders.get(order.id)).toBeDefined();
  });

  it("rolls the order back if preparing the open tx fails (nothing funded yet)", async () => {
    seedListingAndWallets("listing-1", "asset-1");
    vi.spyOn(escrow(), "prepareOpenEscrow").mockRejectedValueOnce(new Error("rpc down"));
    await expect(
      createOrder({ listingId: "listing-1", buyerId: BUYER_ID, buyerSteamId64: "76500000000000000" }),
    ).rejects.toThrow(/rpc down/);
    expect(h.store.orders.size).toBe(0); // deleted
  });

  it("rejects buying your own listing and inactive listings", async () => {
    seedListingAndWallets("listing-1", "asset-1");
    await expect(
      createOrder({ listingId: "listing-1", buyerId: SELLER_ID, buyerSteamId64: "1" }),
    ).rejects.toThrow(/your own/);
    h.store.listings.get("listing-1")!.status = "SOLD";
    await expect(
      createOrder({ listingId: "listing-1", buyerId: BUYER_ID, buyerSteamId64: "1" }),
    ).rejects.toThrow(/not available/);
  });

  it("blocks a banned buyer (by steamId) before any order is created", async () => {
    seedListingAndWallets("listing-1", "asset-1");
    const bannedSteam = "76561198000000000";
    h.store.bans.set("b1", { id: "b1", steamId: bannedSteam, walletAddress: null, liftedAt: null });
    await expect(
      createOrder({ listingId: "listing-1", buyerId: BUYER_ID, buyerSteamId64: bannedSteam }),
    ).rejects.toThrow(/cannot use the marketplace/);
    expect(h.store.orders.size).toBe(0); // never created — checked before the money write
  });

  it("blocks a banned wallet even when the steamId is clean", async () => {
    seedListingAndWallets("listing-1", "asset-1");
    // BUYER_ADDR is the buyer's linked wallet; ban that wallet, leave the steamId unbanned.
    h.store.bans.set("b1", { id: "b1", steamId: null, walletAddress: BUYER_ADDR, liftedAt: null });
    await expect(
      createOrder({ listingId: "listing-1", buyerId: BUYER_ID, buyerSteamId64: "76500000000000000" }),
    ).rejects.toThrow(/cannot use the marketplace/);
    expect(h.store.orders.size).toBe(0);
  });

  it("a lifted ban no longer blocks the buyer", async () => {
    seedListingAndWallets("listing-1", "asset-1");
    h.store.bans.set("b1", { id: "b1", steamId: null, walletAddress: BUYER_ADDR, liftedAt: new Date() });
    const { order } = await createOrder({
      listingId: "listing-1",
      buyerId: BUYER_ID,
      buyerSteamId64: "76500000000000000",
    });
    expect(order.state).toBe("PENDING");
  });
});

// --- fundOrder ---------------------------------------------------------------

/** fundOrder can also return a { retry } result — narrow to the order branch (fail loudly if not). */
async function fundOk(orderId: string, buyerId: string, signedTxBase64: string | null = null) {
  const result = await fundOrder(orderId, buyerId, signedTxBase64);
  if ("retry" in result) throw new Error("expected a settled order, got a retry result");
  return result;
}

describe("fundOrder", () => {
  it("happy path: PENDING → FUNDED, stamps fundedAt + escrow refs, listing → SOLD", async () => {
    const order = seedPendingOrder({ id: "o1", listingId: "l1", steamAssetId: "a1" });
    const funded = await fundOk("o1", BUYER_ID);
    expect(funded.state).toBe("FUNDED");
    expect(funded.fundedAt).toBeInstanceOf(Date);
    expect(funded.escrowPda).toBe("mock-pda-o1");
    expect(funded.onchainOrderId).toBe("mock-oid-o1");
    expect(h.store.listings.get(order.listingId as string)!.status).toBe("SOLD");
    expect((await escrow().get("o1"))!.state).toBe("FUNDED");
  });

  it("is idempotent — a second call returns the order without re-submitting", async () => {
    seedPendingOrder({ id: "o1" });
    await fundOk("o1", BUYER_ID);
    const spy = vi.spyOn(escrow(), "submitAndVerifyOpenEscrow");
    const again = await fundOk("o1", BUYER_ID);
    expect(again.state).toBe("FUNDED");
    expect(spy).not.toHaveBeenCalled();
  });

  it("returns 'order not found' for another user's order (no leak)", async () => {
    seedPendingOrder({ id: "o1" });
    await expect(fundOrder("o1", "someone-else", null)).rejects.toThrow(/order not found/);
  });

  it("throws FundingInProgressError when another call already holds the FUNDING claim", async () => {
    seedPendingOrder({ id: "o1", state: "FUNDING" });
    const spy = vi.spyOn(escrow(), "submitAndVerifyOpenEscrow");
    await expect(fundOrder("o1", BUYER_ID, null)).rejects.toThrow(FundingInProgressError);
    expect(spy).not.toHaveBeenCalled(); // never double-submits
  });

  it("blockhash expiry: reverts the FUNDING claim to PENDING and returns a fresh tx to re-sign", async () => {
    seedPendingOrder({ id: "o1" });
    vi.spyOn(escrow(), "submitAndVerifyOpenEscrow").mockRejectedValueOnce(new EscrowTxExpiredError("aged out"));
    const prepareSpy = vi.spyOn(escrow(), "prepareOpenEscrow");
    const result = await fundOrder("o1", BUYER_ID, "stale-signed-tx");
    expect("retry" in result).toBe(true);
    if ("retry" in result) expect(result.openTx).toEqual({ txBase64: null }); // mock has nothing to sign
    expect(prepareSpy).toHaveBeenCalledTimes(1); // fresh blockhash tx was re-prepared
    expect(h.store.orders.get("o1")!.state).toBe("PENDING"); // claim reverted — cancellable again
  });

  it("a non-expiry submit failure leaves the order FUNDING for the reaper to reconcile", async () => {
    seedPendingOrder({ id: "o1" });
    vi.spyOn(escrow(), "submitAndVerifyOpenEscrow").mockRejectedValueOnce(new Error("rpc timeout"));
    await expect(fundOrder("o1", BUYER_ID, "signed-tx")).rejects.toThrow(/rpc timeout/);
    // NOT blindly reverted to PENDING: the tx may have landed — the reaper resolves it off the chain.
    expect(h.store.orders.get("o1")!.state).toBe("FUNDING");
  });

  it("mismatch (tampered funding): never marks FUNDED — refunds the buyer and marks REFUNDED", async () => {
    seedPendingOrder({ id: "o1" });
    // A tampered client funded the PDA with a different buyer.
    await escrow().openEscrow(openParams("o1", { buyer: "TAMPERED_BUYER" }));
    const result = await fundOk("o1", BUYER_ID);
    expect(result.state).toBe("REFUNDED");
    expect(result.disputeReason).toMatch(/mismatch/i);
    expect((await escrow().get("o1"))!.state).toBe("REFUNDED");
  });

  it("mismatch + refund failure → freeze and mark DISPUTED", async () => {
    seedPendingOrder({ id: "o1" });
    await escrow().openEscrow(openParams("o1", { buyer: "TAMPERED_BUYER" }));
    vi.spyOn(escrow(), "refund").mockRejectedValueOnce(new Error("chain refund failed"));
    const freezeSpy = vi.spyOn(escrow(), "freeze");
    const result = await fundOk("o1", BUYER_ID);
    expect(result.state).toBe("DISPUTED");
    expect(result.disputeReason).toMatch(/mismatch/i);
    expect(freezeSpy).toHaveBeenCalled();
    expect((await escrow().get("o1"))!.state).toBe("DISPUTED");
  });
});

// --- cancelPendingOrder ------------------------------------------------------

describe("cancelPendingOrder", () => {
  it("deletes the order when no escrow exists on-chain", async () => {
    seedPendingOrder({ id: "o1" });
    const result = await cancelPendingOrder("o1", BUYER_ID);
    expect(result).toEqual({ cancelled: true });
    expect(h.store.orders.has("o1")).toBe(false);
  });

  it("does NOT delete but promotes when the escrow actually funded", async () => {
    const order = seedPendingOrder({ id: "o1", listingId: "l1" });
    await escrow().openEscrow(openParams("o1")); // matching escrow exists
    const result = await cancelPendingOrder("o1", BUYER_ID);
    expect(result.cancelled).toBe(false);
    expect(result.cancelled === false && result.order.state).toBe("FUNDED");
    expect(h.store.orders.has("o1")).toBe(true);
    expect(h.store.listings.get(order.listingId as string)!.status).toBe("SOLD");
  });

  it("rejects cancelling a non-PENDING order", async () => {
    seedPendingOrder({ id: "o1", state: "FUNDED" });
    await expect(cancelPendingOrder("o1", BUYER_ID)).rejects.toThrow(/not pending/);
  });

  it("refuses to cancel a FUNDING order — the purchase is confirming on-chain", async () => {
    seedPendingOrder({ id: "o1", state: "FUNDING" });
    await expect(cancelPendingOrder("o1", BUYER_ID)).rejects.toThrow(FundingInProgressError);
    expect(h.store.orders.has("o1")).toBe(true); // never deleted
  });

  it("does NOT delete when a funding claim lands between the chain read and the delete (the F1 race)", async () => {
    seedPendingOrder({ id: "o1" });
    // Simulate a concurrent fundOrder winning the race: our chain read sees nothing, but by the
    // time we delete, the row has been claimed FUNDING. The conditional delete must lose.
    vi.spyOn(escrow(), "get").mockImplementationOnce(async () => {
      h.store.orders.get("o1")!.state = "FUNDING";
      return null;
    });
    await expect(cancelPendingOrder("o1", BUYER_ID)).rejects.toThrow(FundingInProgressError);
    expect(h.store.orders.has("o1")).toBe(true); // the in-flight funding keeps its row
  });
});

// --- expirePendingOrders -----------------------------------------------------

describe("expirePendingOrders", () => {
  it("deletes unfunded, promotes late-funded, refunds mismatched — for BOTH PENDING and FUNDING; skips fresh orders", async () => {
    const old = new Date(Date.now() - 3600_000); // 1h ago
    // A: stale PENDING, no escrow → delete
    seedPendingOrder({ id: "A", listingId: "lA", steamAssetId: "aA", createdAt: old });
    // B: stale PENDING, escrow FUNDED + matching → promote
    seedPendingOrder({ id: "B", listingId: "lB", steamAssetId: "aB", createdAt: old });
    await escrow().openEscrow(openParams("B"));
    // C: stale PENDING, escrow FUNDED + tampered → refund
    seedPendingOrder({ id: "C", listingId: "lC", steamAssetId: "aC", createdAt: old });
    await escrow().openEscrow(openParams("C", { buyer: "TAMPERED_BUYER" }));
    // D: fresh PENDING (created now) → left alone
    seedPendingOrder({ id: "D", listingId: "lD", steamAssetId: "aD" });
    // E: stale FUNDING (fund call died before submitting), no escrow → delete
    seedPendingOrder({ id: "E", listingId: "lE", steamAssetId: "aE", createdAt: old, state: "FUNDING" });
    // F: stale FUNDING (fund call died AFTER the tx landed), escrow FUNDED + matching → promote
    seedPendingOrder({ id: "F", listingId: "lF", steamAssetId: "aF", createdAt: old, state: "FUNDING" });
    await escrow().openEscrow(openParams("F"));

    const results = await expirePendingOrders();
    expect(results).toEqual({ deleted: 2, promoted: 2, refunded: 1, disputed: 0, error: 0 });

    expect(h.store.orders.has("A")).toBe(false);
    expect(h.store.orders.get("B")!.state).toBe("FUNDED");
    expect(h.store.orders.get("C")!.state).toBe("REFUNDED");
    expect(h.store.orders.get("D")!.state).toBe("PENDING");
    expect(h.store.orders.has("E")).toBe(false);
    expect(h.store.orders.get("F")!.state).toBe("FUNDED");
    expect(h.store.listings.get("lF")!.status).toBe("SOLD"); // promotion works from FUNDING too
  });

  it("leaves a row alone when a live fund call moves it between the read and the delete", async () => {
    const old = new Date(Date.now() - 3600_000);
    seedPendingOrder({ id: "R", listingId: "lR", steamAssetId: "aR", createdAt: old });
    // The reaper's chain read finds nothing, but a concurrent fundOrder claims the row meanwhile.
    vi.spyOn(escrow(), "get").mockImplementationOnce(async () => {
      h.store.orders.get("R")!.state = "FUNDING";
      return null;
    });
    const results = await expirePendingOrders();
    expect(results.deleted).toBe(0);
    expect(h.store.orders.get("R")!.state).toBe("FUNDING"); // conditional delete lost — row survives
  });
});

// --- tickOrder ---------------------------------------------------------------

describe("tickOrder", () => {
  it("waits (no-op) on a PENDING order — it isn't a live escrow yet", async () => {
    seedPendingOrder({ id: "o1" });
    const getSpy = vi.spyOn(escrow(), "get");
    const { action } = await tickOrder("o1", "76500000000000000");
    expect(action).toBe("wait");
    expect(getSpy).not.toHaveBeenCalled(); // returned before any escrow/network work
  });

  const HOUR_AGO = () => new Date(Date.now() - 3600_000);

  it("legit SLA refund: chain FUNDED → refund tx + DB REFUNDED + listing relisted", async () => {
    seedPendingOrder({
      id: "o1",
      listingId: "l1",
      state: "FUNDED",
      fundedAt: HOUR_AGO(),
      deliveryDeadline: HOUR_AGO(), // SLA elapsed, no delivery correlated → refund
    });
    await escrow().openEscrow(openParams("o1"));
    const { action } = await tickOrder("o1", "76500000000000000");
    expect(action).toBe("refund");
    expect(h.store.orders.get("o1")!.state).toBe("REFUNDED");
    expect((await escrow().get("o1"))!.state).toBe("REFUNDED");
    expect(h.store.listings.get("l1")!.status).toBe("ACTIVE");
  });

  it("chain-guard: refund action with a NULL chain → waits, never writes REFUNDED (F3)", async () => {
    seedPendingOrder({
      id: "o1",
      state: "FUNDED",
      fundedAt: HOUR_AGO(),
      deliveryDeadline: HOUR_AGO(),
    });
    // No escrow exists at all — DB FUNDED contradicts the chain; advancing to REFUNDED would
    // fabricate a refund that never happened on-chain.
    const { action } = await tickOrder("o1", "76500000000000000");
    expect(action).toBe("wait");
    expect(h.store.orders.get("o1")!.state).toBe("FUNDED");
  });

  it("chain-guard: refund action with chain already REFUNDED → catch-up DB write, NO second refund tx", async () => {
    seedPendingOrder({
      id: "o1",
      listingId: "l1",
      state: "FUNDED",
      fundedAt: HOUR_AGO(),
      deliveryDeadline: HOUR_AGO(),
    });
    await escrow().openEscrow(openParams("o1"));
    await escrow().refund("o1", Math.floor(Date.now() / 1000)); // a previous tick's tx landed, DB write failed
    const refundSpy = vi.spyOn(escrow(), "refund");
    const { action } = await tickOrder("o1", "76500000000000000");
    expect(action).toBe("refund");
    expect(refundSpy).not.toHaveBeenCalled();
    expect(h.store.orders.get("o1")!.state).toBe("REFUNDED");
  });

  it("chain-guard: release action against a DISPUTED chain → waits, never writes RELEASED (F3)", async () => {
    // Operator-vouched hold (no deliveredAssetId) whose window elapsed → the reducer wants release,
    // but the chain was frozen (e.g. a partially-failed freeze wrote chain DISPUTED without the DB).
    seedPendingOrder({
      id: "o1",
      state: "PROTECTION_HOLD",
      fundedAt: HOUR_AGO(),
      protectionUntil: HOUR_AGO(),
      deliveredAssetId: null,
    });
    await escrow().openEscrow(openParams("o1"));
    await escrow().freeze("o1", "operator freeze that never reached the DB");
    const { action } = await tickOrder("o1", "76500000000000000");
    expect(action).toBe("wait");
    expect(h.store.orders.get("o1")!.state).toBe("PROTECTION_HOLD"); // DB must not race ahead to RELEASED
  });
});
