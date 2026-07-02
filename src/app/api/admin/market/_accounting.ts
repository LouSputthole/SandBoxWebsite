import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { formatUsdc } from "@/lib/market/fees";
import type { AccountingOrder } from "@/lib/market/accounting";

/**
 * Minimal projection the pure accounting core needs from each order, plus both parties' wallet
 * addresses (the ledger counterparties). Shared by the accounting summary route and the CSV export.
 */
export const ACCOUNTING_SELECT = {
  id: true,
  priceUsdc: true,
  feeBps: true,
  state: true,
  fundedAt: true,
  deliveredAt: true,
  releasedAt: true,
  refundedAt: true,
  buyer: { select: { wallet: { select: { address: true } } } },
  seller: { select: { wallet: { select: { address: true } } } },
} satisfies Prisma.MarketOrderSelect;

type AccountingRow = Prisma.MarketOrderGetPayload<{ select: typeof ACCOUNTING_SELECT }>;

function toAccountingOrder(o: AccountingRow): AccountingOrder {
  return {
    id: o.id,
    priceUsdc: o.priceUsdc,
    feeBps: o.feeBps,
    state: o.state,
    fundedAt: o.fundedAt,
    deliveredAt: o.deliveredAt,
    releasedAt: o.releasedAt,
    refundedAt: o.refundedAt,
    buyerWallet: o.buyer.wallet?.address ?? null,
    sellerWallet: o.seller.wallet?.address ?? null,
  };
}

/** Load every order as the pure {@link AccountingOrder} shape (oldest first — ledger order). */
export async function loadAccountingOrders(): Promise<AccountingOrder[]> {
  const rows = await prisma.marketOrder.findMany({
    select: ACCOUNTING_SELECT,
    orderBy: { createdAt: "asc" },
  });
  return rows.map(toAccountingOrder);
}

/** Serialize a USDC bigint as both raw base units and a formatted decimal string. */
export function money(baseUnits: bigint): { raw: string; usdc: string } {
  return { raw: baseUnits.toString(), usdc: formatUsdc(baseUnits) };
}
