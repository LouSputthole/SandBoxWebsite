import { describe, it, expect, beforeEach } from "vitest";
import { vi } from "vitest";
import { assertNotBanned, createBan, isBanned, liftBan, listBans, MarketBannedError } from "./bans";

// ---------------------------------------------------------------------------
// bans.ts talks only to Prisma (`@/lib/db`). Mocked with an in-memory fake — just the marketBan
// methods the service calls — mirroring order-service.test.ts's hoisted-store style. `findFirst`
// applies the { liftedAt: null, OR: [...] } filter the service builds so lifted/mismatched bans
// correctly don't match.
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

const h = vi.hoisted(() => ({ store: { bans: new Map<string, Row>(), seq: 0 } }));

interface BanWhere {
  liftedAt?: null;
  OR?: Array<{ steamId?: string; walletAddress?: string }>;
}

function matches(row: Row, where: BanWhere): boolean {
  if (where.liftedAt === null && row.liftedAt != null) return false;
  if (where.OR) {
    return where.OR.some(
      (c) =>
        (c.steamId !== undefined && row.steamId === c.steamId) ||
        (c.walletAddress !== undefined && row.walletAddress === c.walletAddress),
    );
  }
  return true;
}

vi.mock("@/lib/db", () => {
  const { store } = h;
  const clone = <T>(o: T): T => (o && typeof o === "object" ? { ...o } : o);
  const prisma = {
    marketBan: {
      findFirst: async ({ where }: { where: BanWhere }) => {
        const hit = [...store.bans.values()].find((r) => matches(r, where));
        return clone(hit ?? null);
      },
      findMany: async ({ where }: { where?: { liftedAt?: null } } = {}) => {
        let rows = [...store.bans.values()];
        if (where?.liftedAt === null) rows = rows.filter((r) => r.liftedAt == null);
        return rows.sort((a, b) => (b.createdAt as number) - (a.createdAt as number)).map(clone);
      },
      create: async ({ data }: { data: Row }) => {
        const id = `ban-${++store.seq}`;
        const row: Row = {
          steamId: null,
          walletAddress: null,
          orderId: null,
          liftedAt: null,
          createdAt: store.seq,
          ...data,
          id,
        };
        store.bans.set(id, row);
        return clone(row);
      },
      update: async ({ where, data }: { where: { id: string }; data: Row }) => {
        const row = store.bans.get(where.id);
        if (!row) throw new Error(`ban ${where.id} not found`);
        Object.assign(row, data);
        return clone(row);
      },
    },
  };
  return { prisma };
});

// Valid-format fixtures: 17-digit SteamID64s and real 44-char base58 Solana addresses.
const STEAM_A = "76561198000000000";
const STEAM_B = "76561198999999999";
const WALLET_A = "So11111111111111111111111111111111111111112"; // native SOL mint (44 chars)
const WALLET_B = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"; // USDC mint (44 chars)

beforeEach(() => {
  h.store.bans.clear();
  h.store.seq = 0;
});

describe("createBan validation", () => {
  it("requires at least one identifier", async () => {
    await expect(createBan({ reason: "x", bannedByKeyType: "analytics" })).rejects.toThrow(/steamId and\/or a wallet/);
  });

  it("requires a reason", async () => {
    await expect(createBan({ steamId: STEAM_A, reason: "  ", bannedByKeyType: "analytics" })).rejects.toThrow(
      /reason is required/,
    );
  });

  it("rejects a malformed SteamID64", async () => {
    await expect(createBan({ steamId: "not-a-steam-id", reason: "x", bannedByKeyType: "analytics" })).rejects.toThrow(
      /Steam ID/,
    );
  });

  it("rejects a malformed wallet address", async () => {
    await expect(createBan({ walletAddress: "0xnotBase58", reason: "x", bannedByKeyType: "analytics" })).rejects.toThrow(
      /wallet address/,
    );
  });

  it("records both identifiers when both are known", async () => {
    const ban = await createBan({
      steamId: STEAM_A,
      walletAddress: WALLET_A,
      reason: "chargeback fraud",
      bannedByKeyType: "cron",
      orderId: "order-9",
    });
    expect(ban.steamId).toBe(STEAM_A);
    expect(ban.walletAddress).toBe(WALLET_A);
    expect(ban.bannedByKeyType).toBe("cron");
    expect(ban.orderId).toBe("order-9");
    expect(ban.liftedAt).toBeNull();
  });

  it("is idempotent — re-banning an already-active identifier returns the existing ban", async () => {
    const first = await createBan({ steamId: STEAM_A, reason: "scam", bannedByKeyType: "analytics" });
    const second = await createBan({ steamId: STEAM_A, reason: "different reason", bannedByKeyType: "cron" });
    expect(second.id).toBe(first.id);
    expect(second.reason).toBe("scam"); // unchanged
    expect(h.store.bans.size).toBe(1);
  });
});

describe("assertNotBanned / isBanned", () => {
  it("throws MarketBannedError when the steamId matches an active ban", async () => {
    await createBan({ steamId: STEAM_A, reason: "scam", bannedByKeyType: "analytics" });
    await expect(assertNotBanned({ steamId: STEAM_A })).rejects.toBeInstanceOf(MarketBannedError);
    await expect(assertNotBanned({ steamId: STEAM_A })).rejects.toThrow("this account cannot use the marketplace");
    expect(await isBanned({ steamId: STEAM_A })).toBe(true);
  });

  it("throws when the wallet matches — even if the steamId is clean", async () => {
    await createBan({ walletAddress: WALLET_B, reason: "fraud", bannedByKeyType: "cron" });
    await expect(assertNotBanned({ steamId: STEAM_B, walletAddress: WALLET_B })).rejects.toBeInstanceOf(
      MarketBannedError,
    );
  });

  it("does not echo the ban reason to the banned user", async () => {
    await createBan({ steamId: STEAM_A, reason: "SECRET internal note", bannedByKeyType: "analytics" });
    await expect(assertNotBanned({ steamId: STEAM_A })).rejects.toThrow(/marketplace/);
    await expect(assertNotBanned({ steamId: STEAM_A })).rejects.not.toThrow(/SECRET/);
  });

  it("does not match a lifted ban", async () => {
    const ban = await createBan({ steamId: STEAM_A, reason: "scam", bannedByKeyType: "analytics" });
    await liftBan(ban.id);
    await expect(assertNotBanned({ steamId: STEAM_A })).resolves.toBeUndefined();
    expect(await isBanned({ steamId: STEAM_A })).toBe(false);
  });

  it("does not match a different identifier", async () => {
    await createBan({ steamId: STEAM_A, reason: "scam", bannedByKeyType: "analytics" });
    await expect(assertNotBanned({ steamId: STEAM_B })).resolves.toBeUndefined();
    expect(await isBanned({ walletAddress: WALLET_A })).toBe(false);
  });

  it("no-ops when neither identifier is provided (never queries a match)", async () => {
    await createBan({ steamId: STEAM_A, reason: "scam", bannedByKeyType: "analytics" });
    await expect(assertNotBanned({})).resolves.toBeUndefined();
    expect(await isBanned({ steamId: null, walletAddress: undefined })).toBe(false);
  });
});

describe("liftBan / listBans", () => {
  it("liftBan stamps liftedAt and listBans({ activeOnly }) drops it", async () => {
    const a = await createBan({ steamId: "76561198000000001", reason: "a", bannedByKeyType: "analytics" });
    await createBan({ steamId: "76561198000000002", reason: "b", bannedByKeyType: "analytics" });
    await liftBan(a.id);

    const active = await listBans({ activeOnly: true });
    expect(active.map((b) => b.steamId)).toEqual(["76561198000000002"]);

    const all = await listBans();
    expect(all).toHaveLength(2);
  });
});
