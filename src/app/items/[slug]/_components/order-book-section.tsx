"use client";

import type { ReactNode } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Loader2 } from "lucide-react";
import { OrderBook, type OrderLevel } from "@/components/data";
import { Price } from "@/components/ui/price";
import type { UseOrders } from "./use-orders";

/**
 * Order-book column for the item detail page. Adds the highest-buy /
 * lowest-sell summary cards (with total order counts from the /api/orders
 * payload) above the shared Arcade <OrderBook> depth ladder. Orders are
 * fetched once at the page level and passed in via `orders`.
 */

function OrderBookShell({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[18px] border border-line bg-panel p-5">
      <div className="mb-3.5 flex items-center justify-between">
        <h2 className="font-display text-[18px] font-bold text-tx">Order book</h2>
        <span className="font-mono text-[11px] text-faint">PRICE · QTY</span>
      </div>
      {children}
    </div>
  );
}

function SummaryCard({
  side,
  price,
  count,
}: {
  side: "buy" | "sell";
  price: number | null;
  count: number;
}) {
  const isBuy = side === "buy";
  const tint = isBuy ? "var(--up)" : "var(--down)";
  const Icon = isBuy ? ArrowUpFromLine : ArrowDownToLine;
  return (
    <div
      className="rounded-[14px] border bg-bg2 px-3.5 py-3"
      style={{ borderColor: `color-mix(in srgb, ${tint} 26%, var(--line))` }}
    >
      <div className="mb-1 flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5" style={{ color: tint }} />
        <span className="text-[11px] text-faint">
          {isBuy ? "Highest buy" : "Lowest sell"}
        </span>
      </div>
      <div
        className="font-mono text-[19px] font-bold leading-none"
        style={{ color: tint }}
      >
        {price != null ? <Price amount={price} /> : "—"}
      </div>
      <div className="mt-1 text-[11px] text-faint">
        {count.toLocaleString()} {isBuy ? "buy" : "sell"} order
        {count === 1 ? "" : "s"}
      </div>
    </div>
  );
}

export function OrderBookSection({ orders }: { orders: UseOrders }) {
  const { data, loading, error, reload } = orders;

  if (loading) {
    return (
      <OrderBookShell>
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-faint">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading order book…
        </div>
      </OrderBookShell>
    );
  }

  const bids: OrderLevel[] = (data?.buyOrders ?? []).map((o) => ({
    price: o.price,
    qty: o.quantity,
  }));
  const asks: OrderLevel[] = (data?.sellOrders ?? []).map((o) => ({
    price: o.price,
    qty: o.quantity,
  }));

  if (error || (bids.length === 0 && asks.length === 0)) {
    const isPending = error?.includes("pending") || error?.includes("not yet");
    return (
      <OrderBookShell>
        <div className="space-y-2 py-8 text-center">
          <p className="text-sm text-faint">
            {isPending
              ? "Order data is being set up — check back soon."
              : error || "No live order data for this item yet."}
          </p>
          {!isPending && (
            <button
              onClick={reload}
              className="text-xs font-medium text-accent transition hover:brightness-110"
            >
              Try again
            </button>
          )}
        </div>
      </OrderBookShell>
    );
  }

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="grid grid-cols-2 gap-[14px]">
        <SummaryCard
          side="buy"
          price={data?.highestBuyOrder ?? null}
          count={data?.buyOrderCount ?? 0}
        />
        <SummaryCard
          side="sell"
          price={data?.lowestSellOrder ?? null}
          count={data?.sellOrderCount ?? 0}
        />
      </div>
      <OrderBook bids={bids} asks={asks} maxRows={6} />
    </div>
  );
}
