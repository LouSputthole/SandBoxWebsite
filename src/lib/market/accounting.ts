/**
 * Marketplace accounting — PURE money derivations over MarketOrder rows.
 *
 * This module never touches the DB, the clock, or the escrow client. It takes plain
 * MarketOrder-shaped rows and produces the operator's books: a chronological ledger of money
 * movements, an all-time summary, a per-month breakdown, and a CSV export of the ledger.
 *
 * All USDC amounts are **base units** (bigint, 6 decimals — see src/lib/market/fees.ts). The fee
 * math lives in exactly one place: {@link splitFee}. Nothing here does float math on money.
 */

import { formatUsdc, splitFee } from "./fees";
import { MARKET_ORDER_STATES } from "./escrow-state";

const ZERO = BigInt(0);

/**
 * The minimal structural shape this module needs from a MarketOrder row. Deliberately narrower than
 * the Prisma model so callers can pass either a full row or a projection — and so the accounting
 * stays testable without a DB. Wallet addresses are the counterparties for each money movement.
 */
export interface AccountingOrder {
  id: string;
  /** Gross settlement amount in USDC base units. */
  priceUsdc: bigint;
  /** Marketplace fee in basis points (feeAmount is derived from this via splitFee). */
  feeBps: number;
  /** MarketOrder.state (PENDING | FUNDING | FUNDED | PROTECTION_HOLD | RELEASED | REFUNDED | DISPUTED). */
  state: string;
  /** Set once on-chain funding verifies — the signal that money entered escrow. */
  fundedAt: Date | null;
  /** Set when the oracle confirmed delivery — used only for avg-time-to-deliver. */
  deliveredAt?: Date | null;
  releasedAt: Date | null;
  refundedAt: Date | null;
  /** Buyer's wallet address — counterparty for ESCROW_IN and REFUND_BUYER. */
  buyerWallet?: string | null;
  /** Seller's wallet address — counterparty for PAYOUT_SELLER. */
  sellerWallet?: string | null;
}

export type LedgerEntryType = "ESCROW_IN" | "PAYOUT_SELLER" | "FEE_REVENUE" | "REFUND_BUYER";

export interface LedgerEntry {
  orderId: string;
  type: LedgerEntryType;
  /** USDC base units (bigint). */
  amount: bigint;
  /** The wallet on the other side of the movement — or the fee account label for FEE_REVENUE. */
  counterparty: string | null;
  /** When the movement happened. */
  timestamp: Date;
}

/** Counterparty label for the marketplace's own fee take (it has no user wallet). */
export const FEE_ACCOUNT = "marketplace-fee";

/** Order states that count as "funded or later" — money has entered escrow. */
const FUNDED_OR_LATER: ReadonlySet<string> = new Set([
  "FUNDED",
  "PROTECTION_HOLD",
  "DISPUTED",
  "RELEASED",
  "REFUNDED",
]);

/** Order states whose funds are currently sitting in escrow (not yet released or refunded). */
const IN_ESCROW: ReadonlySet<string> = new Set(["FUNDED", "PROTECTION_HOLD", "DISPUTED"]);

/** Stable ordering rank for entries that share a timestamp (money-in before payout before fee). */
const TYPE_RANK: Record<LedgerEntryType, number> = {
  ESCROW_IN: 0,
  PAYOUT_SELLER: 1,
  FEE_REVENUE: 2,
  REFUND_BUYER: 3,
};

/**
 * Chronological money movements across all orders.
 *
 * Per order:
 *  - ESCROW_IN (full amount, at fundedAt) once the order is funded-or-later.
 *  - RELEASED → PAYOUT_SELLER (sellerAmount) + FEE_REVENUE (feeAmount), both at releasedAt.
 *  - REFUNDED → REFUND_BUYER (full amount) at refundedAt.
 *
 * An entry is only emitted when its driving timestamp exists, so every entry can be placed on the
 * timeline. Both buyer-side legs (ESCROW_IN and REFUND_BUYER) additionally gate on fundedAt so the
 * ledger stays BALANCED: a rare tampered-funding order refunded straight from the pre-funded states
 * (never promoted to FUNDED, so fundedAt is null) never legitimately funded in our state sense and
 * emits NO legs — an unpaired REFUND_BUYER would otherwise show money leaving that never entered.
 */
export function deriveLedger(orders: readonly AccountingOrder[]): LedgerEntry[] {
  const entries: LedgerEntry[] = [];

  for (const o of orders) {
    if (FUNDED_OR_LATER.has(o.state) && o.fundedAt) {
      entries.push({
        orderId: o.id,
        type: "ESCROW_IN",
        amount: o.priceUsdc,
        counterparty: o.buyerWallet ?? null,
        timestamp: o.fundedAt,
      });
    }

    if (o.state === "RELEASED" && o.releasedAt) {
      const { sellerAmount, feeAmount } = splitFee(o.priceUsdc, o.feeBps);
      entries.push({
        orderId: o.id,
        type: "PAYOUT_SELLER",
        amount: sellerAmount,
        counterparty: o.sellerWallet ?? null,
        timestamp: o.releasedAt,
      });
      entries.push({
        orderId: o.id,
        type: "FEE_REVENUE",
        amount: feeAmount,
        counterparty: FEE_ACCOUNT,
        timestamp: o.releasedAt,
      });
    }

    // fundedAt gate (like ESCROW_IN): a tampered-funding refund with no fundedAt never entered our
    // books, so it must not emit an unbalanced outflow leg either.
    if (o.state === "REFUNDED" && o.refundedAt && o.fundedAt) {
      entries.push({
        orderId: o.id,
        type: "REFUND_BUYER",
        amount: o.priceUsdc,
        counterparty: o.buyerWallet ?? null,
        timestamp: o.refundedAt,
      });
    }
  }

  entries.sort((a, b) => {
    const dt = a.timestamp.getTime() - b.timestamp.getTime();
    if (dt !== 0) return dt;
    const rank = TYPE_RANK[a.type] - TYPE_RANK[b.type];
    if (rank !== 0) return rank;
    return a.orderId < b.orderId ? -1 : a.orderId > b.orderId ? 1 : 0;
  });

  return entries;
}

export interface AccountingSummary {
  /** Sum of gross priceUsdc over RELEASED orders. */
  grossReleasedVolume: bigint;
  /** Sum of the marketplace fee over RELEASED orders (via splitFee). */
  feeRevenue: bigint;
  /** Sum of gross priceUsdc over REFUNDED orders that actually funded (fundedAt set) — a
   *  tampered-funding refund never entered our books, so it can't inflate the outflow. */
  refundedVolume: bigint;
  /** Money currently held in escrow: FUNDED + PROTECTION_HOLD + DISPUTED, gated on fundedAt (a
   *  DISPUTED tampered funding has no verified deposit to count as float). */
  inEscrowFloat: bigint;
  /** Count of orders per state (all known states initialized to 0). Counts EVERYTHING — unlike the
   *  money sums, it is not fundedAt-gated. */
  countsByState: Record<string, number>;
  /** Mean fundedAt → deliveredAt in whole seconds over orders where both exist, else null. */
  avgTimeToDeliverSeconds: number | null;
}

/** All-time roll-up across every order. */
export function summarize(orders: readonly AccountingOrder[]): AccountingSummary {
  let grossReleasedVolume = ZERO;
  let feeRevenue = ZERO;
  let refundedVolume = ZERO;
  let inEscrowFloat = ZERO;

  const countsByState: Record<string, number> = {};
  for (const s of MARKET_ORDER_STATES) countsByState[s] = 0;

  let deliverSum = 0;
  let deliverCount = 0;

  for (const o of orders) {
    countsByState[o.state] = (countsByState[o.state] ?? 0) + 1;

    if (o.state === "RELEASED") {
      grossReleasedVolume += o.priceUsdc;
      feeRevenue += splitFee(o.priceUsdc, o.feeBps).feeAmount;
    } else if (o.state === "REFUNDED" && o.fundedAt) {
      // fundedAt gate: tampered-funding refunds (never promoted, fundedAt null) are not real volume.
      refundedVolume += o.priceUsdc;
    }

    // fundedAt gate: only verified deposits count as float (mirrors deriveLedger's ESCROW_IN).
    if (IN_ESCROW.has(o.state) && o.fundedAt) inEscrowFloat += o.priceUsdc;

    if (o.fundedAt && o.deliveredAt) {
      deliverSum += (o.deliveredAt.getTime() - o.fundedAt.getTime()) / 1000;
      deliverCount += 1;
    }
  }

  return {
    grossReleasedVolume,
    feeRevenue,
    refundedVolume,
    inEscrowFloat,
    countsByState,
    avgTimeToDeliverSeconds: deliverCount > 0 ? Math.round(deliverSum / deliverCount) : null,
  };
}

export interface MonthlyRow {
  /** Calendar month in UTC, "YYYY-MM". */
  month: string;
  /** Gross released volume settled that month (by releasedAt). */
  releasedVolume: bigint;
  /** Fee revenue recognized that month (by releasedAt). */
  feeRevenue: bigint;
  /** Refunded volume that month (by refundedAt). */
  refundedVolume: bigint;
  /** Orders released that month. */
  releasedCount: number;
  /** Orders refunded that month. */
  refundedCount: number;
  /** releasedCount + refundedCount — orders settled that month. */
  orderCount: number;
}

/** UTC "YYYY-MM" bucket key for a date. */
function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Per calendar month (UTC) breakdown for the books. Released volume + fee revenue are recognized in
 * the month an order RELEASED; refunds in the month an order was REFUNDED. Months with no settled
 * activity are omitted. Sorted oldest → newest.
 */
export function monthlyBreakdown(orders: readonly AccountingOrder[]): MonthlyRow[] {
  const byMonth = new Map<string, MonthlyRow>();

  const rowFor = (month: string): MonthlyRow => {
    let row = byMonth.get(month);
    if (!row) {
      row = {
        month,
        releasedVolume: ZERO,
        feeRevenue: ZERO,
        refundedVolume: ZERO,
        releasedCount: 0,
        refundedCount: 0,
        orderCount: 0,
      };
      byMonth.set(month, row);
    }
    return row;
  };

  for (const o of orders) {
    if (o.state === "RELEASED" && o.releasedAt) {
      const row = rowFor(monthKey(o.releasedAt));
      row.releasedVolume += o.priceUsdc;
      row.feeRevenue += splitFee(o.priceUsdc, o.feeBps).feeAmount;
      row.releasedCount += 1;
      row.orderCount += 1;
    } else if (o.state === "REFUNDED" && o.refundedAt) {
      const row = rowFor(monthKey(o.refundedAt));
      row.refundedVolume += o.priceUsdc;
      row.refundedCount += 1;
      row.orderCount += 1;
    }
  }

  return [...byMonth.values()].sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));
}

/** CSV column order for the ledger export. */
const LEDGER_COLUMNS = ["timestamp", "orderId", "type", "amountUsdc", "counterparty"] as const;

/**
 * Escape a single CSV cell. Mirrors the repo's /api/export defense: neutralize spreadsheet formula
 * injection (cells starting with = @ + - tab CR) then quote when needed.
 */
function csvCell(value: string): string {
  let s = value;
  if (/^[=@+\-\t\r]/.test(s)) s = `'${s}`;
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.startsWith("'")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Render ledger entries as a CSV string (header + rows). USDC amounts are decimal via formatUsdc. */
export function toLedgerCsv(entries: readonly LedgerEntry[]): string {
  const rows = [LEDGER_COLUMNS.join(",")];
  for (const e of entries) {
    rows.push(
      [
        e.timestamp.toISOString(),
        e.orderId,
        e.type,
        formatUsdc(e.amount),
        e.counterparty ?? "",
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return rows.join("\n");
}
