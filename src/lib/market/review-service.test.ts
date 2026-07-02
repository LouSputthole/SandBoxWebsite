import { describe, it, expect, beforeEach, vi } from "vitest";

// ---------------------------------------------------------------------------
// review-service talks to Prisma (`@/lib/db`). Mocked in-memory to exercise createReview's ban gate
// alongside its ownership/state rules. marketBan.findFirst matches the { liftedAt: null, OR: [...] }
// query assertNotBanned builds against a seedable bans store.
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

const h = vi.hoisted(() => ({
  store: {
    orders: new Map<string, Row>(),
    users: new Map<string, Row>(),
    bans: new Map<string, Row>(),
    reviews: [] as Row[],
    seq: 0,
  },
}));

vi.mock("@/lib/db", () => {
  const { store } = h;
  const clone = <T>(o: T): T => (o && typeof o === "object" ? { ...o } : o);
  const prisma = {
    marketOrder: {
      findUnique: async ({ where }: { where: { id: string } }) => clone(store.orders.get(where.id) ?? null),
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
    marketReview: {
      create: async ({ data }: { data: Row }) => {
        const row = { id: `review-${++store.seq}`, createdAt: new Date(), ...data };
        store.reviews.push(row);
        return clone(row);
      },
    },
  };
  return { prisma };
});

import { createReview } from "./review-service";

const BUYER_ID = "buyer-1";
const SELLER_ID = "seller-1";
const STEAM = "76561198000000000";
const WALLET = "So11111111111111111111111111111111111111112";

function seedReleasedOrder() {
  h.store.orders.set("order-1", { buyerId: BUYER_ID, sellerId: SELLER_ID, state: "RELEASED" });
  h.store.users.set(BUYER_ID, { id: BUYER_ID, steamId: STEAM, wallet: { address: WALLET } });
}

beforeEach(() => {
  h.store.orders.clear();
  h.store.users.clear();
  h.store.bans.clear();
  h.store.reviews = [];
  h.store.seq = 0;
});

describe("createReview ban enforcement", () => {
  it("an unbanned buyer can review a RELEASED order", async () => {
    seedReleasedOrder();
    const review = await createReview({ orderId: "order-1", buyerId: BUYER_ID, stars: 5 });
    expect(review.stars).toBe(5);
    expect(h.store.reviews).toHaveLength(1);
  });

  it("blocks a banned reviewer (by steamId) and writes no review", async () => {
    seedReleasedOrder();
    h.store.bans.set("b1", { id: "b1", steamId: STEAM, walletAddress: null, liftedAt: null });
    await expect(createReview({ orderId: "order-1", buyerId: BUYER_ID, stars: 5 })).rejects.toThrow(
      /cannot use the marketplace/,
    );
    expect(h.store.reviews).toHaveLength(0);
  });

  it("blocks a banned wallet even when the steamId is clean", async () => {
    seedReleasedOrder();
    h.store.bans.set("b1", { id: "b1", steamId: null, walletAddress: WALLET, liftedAt: null });
    await expect(createReview({ orderId: "order-1", buyerId: BUYER_ID, stars: 4 })).rejects.toThrow(
      /cannot use the marketplace/,
    );
  });
});
