import { prisma } from "@/lib/db";

/**
 * Self-service account deletion / data erasure (DSAR — GDPR/CCPA "right to delete").
 *
 * Design principle (from the privacy-compliance analysis): personal data the operator controls
 * OFF-chain is deletable and we honor that; ON-chain data is pseudonymous (wallet addresses + tx
 * signatures only — no identity is ever written to the chain) and is permanent. So "delete" means:
 *   - HARD-DELETE the pure PII / re-creatable rows (sessions, wallet link, the encrypted seller API
 *     key, watchlist, alerts, notifications, login events, trade-board posts).
 *   - ANONYMIZE + RETAIN the financial/reputation records (completed escrow orders + the reviews the
 *     user wrote) so the public ledger stays accurate for accounting while carrying no identity.
 *   - RETAIN untouched any marketplace BAN keyed to the user's Steam id / wallet (ban-evasion
 *     protection — a ban must survive account deletion).
 *   - NEVER touch the chain.
 *
 * The User row itself is ANONYMIZED, not hard-deleted: completed MarketOrders FK to it with
 * onDelete RESTRICT, so a hard delete would be blocked by any retained order. Tombstoning the row
 * (steamId → "deleted:<id>", identity fields nulled, deletedAt stamped) satisfies those FKs while
 * carrying no PII, and frees the unique steamId so a future Steam login creates a FRESH account.
 */

/** The MarketOrder states that mean "money is in flight" — a user with any of these as buyer OR
 *  seller cannot delete (an escrow could settle mid-deletion). Completed = RELEASED / REFUNDED. */
export const LIVE_ORDER_STATES = [
  "PENDING",
  "FUNDING",
  "FUNDED",
  "PROTECTION_HOLD",
  "DISPUTED",
] as const;

/** Terminal, money-settled order states — these are ANONYMIZED + RETAINED, never blocked on. */
export const COMPLETED_ORDER_STATES = ["RELEASED", "REFUNDED"] as const;

/**
 * Thrown by {@link deleteAccount} when the escrow-safety guard trips: the user still has live orders
 * or an active listing, so deleting now could strand funds or let someone buy a listing mid-deletion.
 * The API maps this to HTTP 409. The message names what must settle first.
 */
export class AccountDeletionBlockedError extends Error {
  constructor(
    public readonly liveOrders: number,
    public readonly activeListings: number,
  ) {
    const parts: string[] = [];
    if (liveOrders > 0) parts.push(`${liveOrders} active order${liveOrders === 1 ? "" : "s"}`);
    if (activeListings > 0)
      parts.push(`${activeListings} active listing${activeListings === 1 ? "" : "s"}`);
    const what = parts.join(" and ");
    super(`You have ${what}; cancel or let them complete before deleting your account.`);
    this.name = "AccountDeletionBlockedError";
  }
}

export interface DeleteAccountSummary {
  /** Row counts hard-deleted (or, for trade comments, soft-deleted) per model. */
  deleted: {
    sessions: number;
    userWallets: number;
    sellerCredentials: number;
    watchlistItems: number;
    priceAlerts: number;
    notifications: number;
    loginEvents: number;
    tradeListings: number;
    /** Public barter-board comments have a `deletedAt` column → soft-deleted, not removed. */
    tradeCommentsSoftDeleted: number;
  };
  /** Completed orders whose party visibility we flipped to private (the user is now "Anonymous"). */
  anonymizedOrders: number;
  /** Marketplace bans matching this user's Steam id / wallet that we DELIBERATELY kept. */
  retainedBans: number;
}

/**
 * Erase / anonymize everything the operator controls for `userId`, honoring the escrow-safety guard.
 * Throws {@link AccountDeletionBlockedError} if the user has live orders or an active listing.
 * All destructive writes run in a single interactive transaction so a partial deletion can't happen.
 */
export async function deleteAccount(userId: string): Promise<DeleteAccountSummary> {
  // Capture the identity keys BEFORE anonymizing. Bans store the LITERAL steamId / wallet strings
  // (not a FK), so tombstoning the User row doesn't break existing bans — but we read them here so
  // the returned summary can report how many survive, and so the ban-match is computed pre-tombstone.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, steamId: true, wallet: { select: { address: true } } },
  });
  if (!user) throw new Error("user not found");
  const steamId = user.steamId;
  const walletAddress = user.wallet?.address ?? null;

  // --- Escrow-safety guard (must pass BEFORE any write) ----------------------------------------
  const [liveOrders, activeListings] = await Promise.all([
    prisma.marketOrder.count({
      where: {
        state: { in: [...LIVE_ORDER_STATES] },
        OR: [{ buyerId: userId }, { sellerId: userId }],
      },
    }),
    prisma.marketListing.count({ where: { sellerId: userId, status: "ACTIVE" } }),
  ]);
  if (liveOrders > 0 || activeListings > 0) {
    throw new AccountDeletionBlockedError(liveOrders, activeListings);
  }

  // Bans keyed to either identifier — counted for the summary; NEVER deleted (ban-evasion defense).
  const banOr: Array<{ steamId?: string; walletAddress?: string }> = [{ steamId }];
  if (walletAddress) banOr.push({ walletAddress });
  const retainedBans = await prisma.marketBan.count({ where: { OR: banOr } });

  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    // --- HARD-DELETE: pure PII / re-creatable ---------------------------------------------------
    const sessions = await tx.session.deleteMany({ where: { userId } });
    const userWallets = await tx.userWallet.deleteMany({ where: { userId } });
    // The AES-GCM-encrypted Steam Web API key MUST be destroyed.
    const sellerCredentials = await tx.sellerSteamCredential.deleteMany({ where: { userId } });
    const watchlistItems = await tx.watchlistItem.deleteMany({ where: { userId } });
    const priceAlerts = await tx.priceAlert.deleteMany({ where: { userId } });
    const notifications = await tx.notification.deleteMany({ where: { userId } });
    // Login events carry hashed IPs + user-agent strings — delete them.
    const loginEvents = await tx.loginEvent.deleteMany({ where: { userId } });

    // Public barter board. TradeComment has a `deletedAt` soft-delete column (moderation trail) —
    // match that convention. TradeListing has NO soft-delete column → hard delete.
    const tradeComments = await tx.tradeComment.updateMany({
      where: { userId, deletedAt: null },
      data: { deletedAt: now, deletedBy: "account-deletion" },
    });
    const tradeListings = await tx.tradeListing.deleteMany({ where: { userId } });

    // --- ANONYMIZE + RETAIN: completed escrow orders --------------------------------------------
    // Flip the deleting party's public flag so the ledger shows them "Anonymous" while the financial
    // proof-chain (amounts, tx signatures) stays intact. Two updateMany (the user may be either party
    // on different orders; the CHECK buyer<>seller means never both on the same one).
    const anonBuyer = await tx.marketOrder.updateMany({
      where: { buyerId: userId, state: { in: [...COMPLETED_ORDER_STATES] } },
      data: { buyerPublic: false },
    });
    const anonSeller = await tx.marketOrder.updateMany({
      where: { sellerId: userId, state: { in: [...COMPLETED_ORDER_STATES] } },
      data: { sellerPublic: false },
    });
    // MarketReviews the user WROTE need no explicit write: they FK to the (now-tombstoned) User via
    // raterId, and every renderer degrades a null username to "Anonymous trader" — so the star rating
    // + comment survive for the seller's rep while the author is anonymized automatically.

    // --- ANONYMIZE the User row (keeps the RESTRICT FKs on retained orders satisfiable) ----------
    await tx.user.update({
      where: { id: userId },
      data: {
        steamId: `deleted:${userId}`,
        username: null,
        avatarUrl: null,
        profileUrl: null,
        steamTradeUrl: null,
        deletedAt: now,
      },
    });

    return {
      sessions: sessions.count,
      userWallets: userWallets.count,
      sellerCredentials: sellerCredentials.count,
      watchlistItems: watchlistItems.count,
      priceAlerts: priceAlerts.count,
      notifications: notifications.count,
      loginEvents: loginEvents.count,
      tradeListings: tradeListings.count,
      tradeCommentsSoftDeleted: tradeComments.count,
      anonymizedOrders: anonBuyer.count + anonSeller.count,
    };
  });

  return {
    deleted: {
      sessions: result.sessions,
      userWallets: result.userWallets,
      sellerCredentials: result.sellerCredentials,
      watchlistItems: result.watchlistItems,
      priceAlerts: result.priceAlerts,
      notifications: result.notifications,
      loginEvents: result.loginEvents,
      tradeListings: result.tradeListings,
      tradeCommentsSoftDeleted: result.tradeCommentsSoftDeleted,
    },
    anonymizedOrders: result.anonymizedOrders,
    retainedBans,
  };
}
