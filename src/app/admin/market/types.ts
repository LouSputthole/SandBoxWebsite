/** Client-side shapes for the admin market dashboard — mirror the API serializers exactly. */

/** A USDC amount serialized both ways by the accounting endpoints. */
export interface Money {
  raw: string;
  usdc: string;
}

export interface AdminTradeAttempt {
  id: string;
  tradeOfferId: string | null;
  status: string;
  evidence: unknown;
  createdAt: string | null;
}

export interface AdminOrder {
  id: string;
  state: string;
  listingId: string;
  buyerId: string;
  sellerId: string;

  priceUsdc: string;
  priceUsdcFormatted: string;
  feeBps: number;
  sellerAmount: string;
  sellerAmountFormatted: string;
  feeAmount: string;
  feeAmountFormatted: string;

  escrowPda: string | null;
  onchainOrderId: string | null;
  disputeReason: string | null;

  steamAssetId: string;
  classId: string;
  instanceId: string;
  deliveredAssetId: string | null;

  deliveryDeadline: string | null;
  protectionUntil: string | null;
  fundedAt: string | null;
  sellerSentAt: string | null;
  deliveredAt: string | null;
  protectionStartedAt: string | null;
  releasedAt: string | null;
  refundedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;

  listing: {
    id: string;
    priceUsd: number;
    status: string;
    item: { name: string; slug: string; imageUrl: string | null; type: string };
  };
  buyer: { id: string; username: string | null; steamId: string; wallet: string | null };
  seller: { id: string; username: string | null; steamId: string; wallet: string | null };
  tradeAttempts: AdminTradeAttempt[];
}

export interface OrdersResponse {
  orders: AdminOrder[];
  total: number;
  countsByState: Record<string, number>;
  activeListings: number;
  take: number;
  skip: number;
}

export interface ChainRecord {
  orderId: string;
  escrowPda: string;
  onchainOrderId: string;
  buyer: string;
  seller: string;
  amount: string;
  feeBps: number;
  state: string;
  deliveryDeadline: number;
  protectionUntil: number | null;
}

export interface OrderDetailResponse {
  order: AdminOrder;
  chain: ChainRecord | null;
  chainError: string | null;
  chainMismatch: boolean;
}

export interface MonthlyRowResponse {
  month: string;
  releasedVolume: Money;
  feeRevenue: Money;
  refundedVolume: Money;
  releasedCount: number;
  refundedCount: number;
  orderCount: number;
}

export interface AccountingResponse {
  summary: {
    grossReleasedVolume: Money;
    feeRevenue: Money;
    refundedVolume: Money;
    inEscrowFloat: Money;
    countsByState: Record<string, number>;
    avgTimeToDeliverSeconds: number | null;
  };
  monthly: MonthlyRowResponse[];
}

/** State → badge color class (Arcade tokens). Live states use the brand accent, terminals up/down. */
export const STATE_COLOR: Record<string, string> = {
  PENDING: "text-mut border-line",
  FUNDING: "text-cat-tool border-cat-tool/40",
  FUNDED: "text-cat-tool border-cat-tool/40",
  PROTECTION_HOLD: "text-accent border-accent/40",
  DISPUTED: "text-down border-down/40",
  RELEASED: "text-up border-up/40",
  REFUNDED: "text-mut border-line",
};

export const FILTER_STATES = [
  "all",
  "PENDING",
  "FUNDING",
  "FUNDED",
  "PROTECTION_HOLD",
  "DISPUTED",
  "RELEASED",
  "REFUNDED",
] as const;

/** A marketplace ban row — mirrors serializeBan in /api/admin/market/ban. */
export interface AdminBan {
  id: string;
  steamId: string | null;
  walletAddress: string | null;
  reason: string;
  bannedByKeyType: string;
  orderId: string | null;
  createdAt: string;
  liftedAt: string | null;
  active: boolean;
}

export interface BansResponse {
  bans: AdminBan[];
}
