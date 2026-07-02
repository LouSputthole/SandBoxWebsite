/**
 * Server-side glue between Prisma MarketOrder rows and the PURE {@link toLedgerEntry} shaper. Kept
 * out of ledger.ts (which stays DB-free + unit-testable) so both the public ledger (/market/ledger)
 * and public profiles (/market/u/[steamId]) load completed-trade proof chains through ONE place —
 * same include, same projection, same privacy semantics.
 */

import { prisma } from "@/lib/db";
import { toLedgerEntry, type LedgerEntry, type LedgerOrderInput } from "./ledger";

/** Prisma `include` selecting exactly the fields {@link toLedgerInput} reads. Only the latest
 *  trade-offer id is pulled. */
export const LEDGER_INCLUDE = {
  listing: {
    include: { item: { select: { name: true, slug: true, imageUrl: true, type: true, rarityColor: true } } },
  },
  buyer: { select: { username: true, avatarUrl: true, steamId: true, wallet: { select: { address: true } } } },
  seller: { select: { username: true, avatarUrl: true, steamId: true, wallet: { select: { address: true } } } },
  tradeAttempts: {
    where: { tradeOfferId: { not: null } },
    orderBy: { createdAt: "desc" as const },
    take: 1,
    select: { tradeOfferId: true },
  },
} as const;

/** The structural shape a row hydrated with {@link LEDGER_INCLUDE} exposes (a full Prisma row is
 *  assignable to it — narrowing keeps the projection independent of the generated types). */
export interface LedgerRowShape {
  id: string;
  state: string;
  priceUsdc: bigint;
  buyerPublic: boolean;
  sellerPublic: boolean;
  escrowPda: string | null;
  openTxSig: string | null;
  confirmTxSig: string | null;
  settleTxSig: string | null;
  fundedAt: Date | null;
  sellerSentAt: Date | null;
  deliveredAt: Date | null;
  releasedAt: Date | null;
  refundedAt: Date | null;
  deliveredAssetId: string | null;
  buyer: { username: string | null; avatarUrl: string | null; steamId: string; wallet: { address: string } | null };
  seller: { username: string | null; avatarUrl: string | null; steamId: string; wallet: { address: string } | null };
  listing: { item: { name: string; slug: string; imageUrl: string | null; type: string; rarityColor: string | null } };
  tradeAttempts: { tradeOfferId: string | null }[];
}

/** Project a hydrated MarketOrder row into the pure {@link LedgerOrderInput}. */
export function toLedgerInput(o: LedgerRowShape): LedgerOrderInput {
  return {
    id: o.id,
    state: o.state,
    priceUsdc: o.priceUsdc,
    buyerPublic: o.buyerPublic,
    sellerPublic: o.sellerPublic,
    escrowPda: o.escrowPda,
    openTxSig: o.openTxSig,
    confirmTxSig: o.confirmTxSig,
    settleTxSig: o.settleTxSig,
    fundedAt: o.fundedAt,
    sellerSentAt: o.sellerSentAt,
    deliveredAt: o.deliveredAt,
    releasedAt: o.releasedAt,
    refundedAt: o.refundedAt,
    deliveredAssetId: o.deliveredAssetId,
    tradeOfferId: o.tradeAttempts[0]?.tradeOfferId ?? null,
    buyer: {
      username: o.buyer.username,
      avatarUrl: o.buyer.avatarUrl,
      steamId: o.buyer.steamId,
      wallet: o.buyer.wallet?.address ?? null,
    },
    seller: {
      username: o.seller.username,
      avatarUrl: o.seller.avatarUrl,
      steamId: o.seller.steamId,
      wallet: o.seller.wallet?.address ?? null,
    },
    item: {
      name: o.listing.item.name,
      slug: o.listing.item.slug,
      imageUrl: o.listing.item.imageUrl,
      type: o.listing.item.type,
      rarityColor: o.listing.item.rarityColor,
    },
  };
}

/**
 * Hydrate completed orders by id into ledger entries, PRESERVING the given id order (a `findMany`
 * with `in` does not guarantee it — callers pass ids already sorted by completion time via raw SQL).
 */
export async function ledgerEntriesForIds(ids: string[]): Promise<LedgerEntry[]> {
  if (ids.length === 0) return [];
  const rows = await prisma.marketOrder.findMany({ where: { id: { in: ids } }, include: LEDGER_INCLUDE });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids
    .map((id) => byId.get(id))
    .filter((r): r is NonNullable<typeof r> => !!r)
    .map((o) => toLedgerEntry(toLedgerInput(o)));
}
