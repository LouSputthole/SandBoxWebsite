import { prisma } from "@/lib/db";
import { assertNotBanned } from "./bans";

/** Seller isn't ready to list (no wallet / no Steam key / no Mobile Authenticator). */
export class SellerNotReadyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SellerNotReadyError";
  }
}

export interface CreateListingInput {
  sellerId: string;
  itemId: string;
  /** the exact Steam copy the seller is putting up (verified as owned by the caller). */
  steamAssetId: string;
  classId: string;
  instanceId: string;
  priceUsd: number;
}

/**
 * Create an ACTIVE listing. Enforces seller readiness (linked wallet + Steam API key + Mobile
 * Authenticator, so Steam doesn't hold the sent item up to 15 days) and a positive price. The
 * "one ACTIVE listing per steamAssetId" rule is enforced by the DB partial-unique index — a
 * duplicate throws a Prisma unique-constraint error, which callers surface as a 409.
 */
export async function createListing(input: CreateListingInput) {
  if (!Number.isFinite(input.priceUsd) || input.priceUsd <= 0) throw new Error("price must be positive");

  const [wallet, cred, seller] = await Promise.all([
    prisma.userWallet.findUnique({ where: { userId: input.sellerId } }),
    prisma.sellerSteamCredential.findUnique({ where: { userId: input.sellerId } }),
    prisma.user.findUnique({ where: { id: input.sellerId }, select: { steamId: true } }),
  ]);

  // Ban gate — a banned seller (by Steam id OR linked wallet) can never create a listing (TOS §17),
  // checked before the readiness errors so a banned user gets the ban message first, and BEFORE any
  // DB write. Throws MarketBannedError; the listings route maps it to 403 (same pattern the orders /
  // review / wallet routes use), so the generic message reaches the user without echoing the reason.
  await assertNotBanned({ steamId: seller?.steamId, walletAddress: wallet?.address });

  if (!wallet) throw new SellerNotReadyError("link a Solana wallet before listing");
  if (!cred) throw new SellerNotReadyError("link a Steam API key before listing");
  if (!cred.mobileAuthConfirmed) {
    throw new SellerNotReadyError("enable Steam Guard Mobile Authenticator before listing");
  }

  // A physical asset can back at most one live order at a time. Block re-listing an asset that's
  // already mid-sale (belt to the DB `MarketOrder_live_per_asset_unique` index).
  const liveOrder = await prisma.marketOrder.findFirst({
    where: { steamAssetId: input.steamAssetId, state: { in: ["FUNDED", "PROTECTION_HOLD", "DISPUTED"] } },
    select: { id: true },
  });
  if (liveOrder) throw new SellerNotReadyError("That item is already being sold in an active order");

  return prisma.marketListing.create({
    data: {
      sellerId: input.sellerId,
      itemId: input.itemId,
      steamAssetId: input.steamAssetId,
      classId: input.classId,
      instanceId: input.instanceId,
      priceUsd: input.priceUsd,
      status: "ACTIVE",
    },
  });
}

export interface BrowseOptions {
  itemId?: string;
  /** Restrict to one seller's stall (public profile page). */
  sellerId?: string;
  take?: number;
  skip?: number;
}

/** Active listings for the browse page (newest first), with item + minimal seller info. */
export async function getActiveListings(opts: BrowseOptions = {}) {
  return prisma.marketListing.findMany({
    where: {
      status: "ACTIVE",
      ...(opts.itemId ? { itemId: opts.itemId } : {}),
      ...(opts.sellerId ? { sellerId: opts.sellerId } : {}),
    },
    include: {
      item: true,
      seller: { select: { id: true, username: true, avatarUrl: true } },
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(opts.take ?? 50, 100),
    skip: opts.skip ?? 0,
  });
}

/** Delist an ACTIVE listing you own. A live order blocks it (the DB live-order index guards too). */
export async function delistListing(listingId: string, sellerId: string) {
  const listing = await prisma.marketListing.findUnique({ where: { id: listingId } });
  if (!listing || listing.sellerId !== sellerId) throw new Error("listing not found");
  if (listing.status !== "ACTIVE") throw new Error("listing is not active");
  return prisma.marketListing.update({
    where: { id: listingId },
    data: { status: "DELISTED" },
  });
}
