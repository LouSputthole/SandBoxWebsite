import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";

/**
 * Marketplace ban enforcement (TOS §17). A ban blocks an identifier — a Steam id and/or a Solana
 * wallet — from every money-entry point (createOrder / createListing / createReview), making the
 * "ban a Steam id + wallet" promise real. A ban is ACTIVE while `liftedAt` IS NULL; lifting is a soft
 * delete that keeps history. Identifiers are matched EXACTLY as stored elsewhere (steamId =
 * User.steamId 64-bit string; walletAddress = UserWallet.address base58) — no case-folding, since
 * base58 is case-significant. See the MarketBan model + the 20260701134600_add_marketplace migration.
 */

/**
 * Thrown by {@link assertNotBanned} when an active ban matches either identifier. The message is
 * DELIBERATELY generic — never echo the ban reason to the banned user (that only helps evasion). The
 * market money-entry routes (listings / orders / review / wallet) catch it and return HTTP 403 with
 * this generic message.
 */
export class MarketBannedError extends Error {
  constructor(message = "this account cannot use the marketplace") {
    super(message);
    this.name = "MarketBannedError";
  }
}

export interface BanIdentifiers {
  steamId?: string | null;
  walletAddress?: string | null;
}

/** A SteamID64 is a 17-digit number in the individual-account space (all begin "7656"). */
const STEAMID64 = /^7656\d{13}$/;
/** A Solana address is 32–44 chars of the base58 alphabet (mirrors the wallet-link route). */
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** Trim to a stored-form identifier, or null if blank. No case-folding (base58 is case-significant). */
const normId = (v: string | null | undefined): string | null => {
  const t = v?.trim();
  return t ? t : null;
};

/**
 * Build the `where` matching an ACTIVE ban on EITHER provided identifier (one OR query). Returns null
 * when neither identifier is present — callers treat that as "nothing to check" (never a match).
 */
function activeMatchWhere(ids: BanIdentifiers): Prisma.MarketBanWhereInput | null {
  const steamId = normId(ids.steamId);
  const walletAddress = normId(ids.walletAddress);
  const or: Prisma.MarketBanWhereInput[] = [];
  if (steamId) or.push({ steamId });
  if (walletAddress) or.push({ walletAddress });
  if (or.length === 0) return null;
  return { liftedAt: null, OR: or };
}

/**
 * Throw {@link MarketBannedError} if ANY active ban matches either provided identifier. A single OR
 * query. No identifier (both blank) → no-op (nothing to enforce). Call this BEFORE any money moves.
 */
export async function assertNotBanned(ids: BanIdentifiers): Promise<void> {
  const where = activeMatchWhere(ids);
  if (!where) return;
  const hit = await prisma.marketBan.findFirst({ where, select: { id: true } });
  if (hit) throw new MarketBannedError();
}

/** Boolean form of {@link assertNotBanned} for gate/UX checks (no throw). */
export async function isBanned(ids: BanIdentifiers): Promise<boolean> {
  const where = activeMatchWhere(ids);
  if (!where) return false;
  const hit = await prisma.marketBan.findFirst({ where, select: { id: true } });
  return hit !== null;
}

export interface CreateBanInput {
  steamId?: string | null;
  walletAddress?: string | null;
  reason: string;
  /** From guardAdminRoute — "analytics" | "cron" — who issued the ban. */
  bannedByKeyType: string;
  /** Optional link to the order that triggered the ban (quick-ban from a dispute). */
  orderId?: string | null;
}

/**
 * Ban an identifier. Requires at least one of steamId / walletAddress, each in a valid format
 * (17-digit SteamID64 / 32–44-char base58 wallet), plus a non-empty reason. Records BOTH identifiers
 * when known so a later re-ban of either is idempotent. Upsert-safe: if either identifier already
 * carries an ACTIVE ban, returns that existing ban unchanged (never a duplicate). The partial-unique
 * indexes are the DB backstop for the same guarantee under a race.
 */
export async function createBan(input: CreateBanInput) {
  const steamId = normId(input.steamId);
  const walletAddress = normId(input.walletAddress);
  if (!steamId && !walletAddress) {
    throw new Error("a ban requires a steamId and/or a wallet address");
  }
  if (steamId && !STEAMID64.test(steamId)) throw new Error("invalid Steam ID (expected a 17-digit SteamID64)");
  if (walletAddress && !BASE58.test(walletAddress)) throw new Error("invalid Solana wallet address");
  const reason = input.reason?.trim();
  if (!reason) throw new Error("a ban reason is required");

  const existing = await prisma.marketBan.findFirst({ where: activeMatchWhere({ steamId, walletAddress })! });
  if (existing) return existing;

  try {
    return await prisma.marketBan.create({
      data: {
        steamId,
        walletAddress,
        reason,
        bannedByKeyType: input.bannedByKeyType,
        orderId: normId(input.orderId),
      },
    });
  } catch (err) {
    // Lost a race to a concurrent ban of the same identifier — the partial-unique index tripped.
    // Return the winner so the caller still sees an idempotent success. P2002 detected structurally
    // (no runtime Prisma value import — vitest can't resolve the generated client's `@/` alias).
    if (err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "P2002") {
      const winner = await prisma.marketBan.findFirst({ where: activeMatchWhere({ steamId, walletAddress })! });
      if (winner) return winner;
    }
    throw err;
  }
}

/** Soft-lift a ban: stamp `liftedAt` so it stops matching but the row (history) survives. */
export async function liftBan(id: string) {
  return prisma.marketBan.update({ where: { id }, data: { liftedAt: new Date() } });
}

export interface ListBansOptions {
  activeOnly?: boolean;
  take?: number;
  skip?: number;
}

/** Bans newest-first. `activeOnly` (default false) restricts to still-active (liftedAt IS NULL) bans. */
export async function listBans(opts: ListBansOptions = {}) {
  return prisma.marketBan.findMany({
    where: opts.activeOnly ? { liftedAt: null } : {},
    orderBy: { createdAt: "desc" },
    take: Math.min(opts.take ?? 100, 200),
    skip: opts.skip ?? 0,
  });
}
