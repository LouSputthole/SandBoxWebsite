import { Prisma } from "@/generated/prisma/client";
import { formatUsdc, splitFee } from "@/lib/market/fees";

/**
 * Shared MarketOrder projection + JSON serializer for the admin market API. Not a route (Next only
 * treats route.ts as an endpoint) — imported by the orders list + detail handlers so they emit the
 * exact same shape. SellerSteamCredential is deliberately NOT included: key material never leaves
 * the DB via this API.
 */
export const ORDER_INCLUDE = {
  listing: { include: { item: { select: { name: true, slug: true, imageUrl: true, type: true } } } },
  buyer: { select: { id: true, username: true, steamId: true, wallet: { select: { address: true } } } },
  seller: { select: { id: true, username: true, steamId: true, wallet: { select: { address: true } } } },
  tradeAttempts: {
    orderBy: { createdAt: "asc" },
    select: { id: true, tradeOfferId: true, status: true, evidence: true, createdAt: true },
  },
} satisfies Prisma.MarketOrderInclude;

export type OrderWithRelations = Prisma.MarketOrderGetPayload<{ include: typeof ORDER_INCLUDE }>;

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

/**
 * Flatten a MarketOrder (+relations) into a JSON-safe object: bigints → strings, dates → ISO. The
 * gross priceUsdc is emitted both raw (base units, for exact math) and formatted, plus the derived
 * seller/fee split (fee math via splitFee — never duplicated).
 */
export function serializeOrder(o: OrderWithRelations) {
  const { sellerAmount, feeAmount } = splitFee(o.priceUsdc, o.feeBps);
  return {
    id: o.id,
    state: o.state,
    listingId: o.listingId,
    buyerId: o.buyerId,
    sellerId: o.sellerId,

    priceUsdc: o.priceUsdc.toString(),
    priceUsdcFormatted: formatUsdc(o.priceUsdc),
    feeBps: o.feeBps,
    sellerAmount: sellerAmount.toString(),
    sellerAmountFormatted: formatUsdc(sellerAmount),
    feeAmount: feeAmount.toString(),
    feeAmountFormatted: formatUsdc(feeAmount),

    escrowPda: o.escrowPda,
    onchainOrderId: o.onchainOrderId,
    disputeReason: o.disputeReason,

    steamAssetId: o.steamAssetId,
    classId: o.classId,
    instanceId: o.instanceId,
    deliveredAssetId: o.deliveredAssetId,

    deliveryDeadline: iso(o.deliveryDeadline),
    protectionUntil: iso(o.protectionUntil),
    fundedAt: iso(o.fundedAt),
    sellerSentAt: iso(o.sellerSentAt),
    deliveredAt: iso(o.deliveredAt),
    protectionStartedAt: iso(o.protectionStartedAt),
    releasedAt: iso(o.releasedAt),
    refundedAt: iso(o.refundedAt),
    createdAt: iso(o.createdAt),
    updatedAt: iso(o.updatedAt),

    listing: {
      id: o.listing.id,
      priceUsd: o.listing.priceUsd,
      status: o.listing.status,
      item: {
        name: o.listing.item.name,
        slug: o.listing.item.slug,
        imageUrl: o.listing.item.imageUrl,
        type: o.listing.item.type,
      },
    },
    buyer: {
      id: o.buyer.id,
      username: o.buyer.username,
      steamId: o.buyer.steamId,
      wallet: o.buyer.wallet?.address ?? null,
    },
    seller: {
      id: o.seller.id,
      username: o.seller.username,
      steamId: o.seller.steamId,
      wallet: o.seller.wallet?.address ?? null,
    },
    tradeAttempts: o.tradeAttempts.map((t) => ({
      id: t.id,
      tradeOfferId: t.tradeOfferId,
      status: t.status,
      evidence: t.evidence,
      createdAt: iso(t.createdAt),
    })),
  };
}
