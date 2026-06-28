import * as React from "react";
import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/ui/tooltip";

/**
 * Two-sided depth view for the item detail page. Asks (red `--down`) stack
 * above a centered spread row; bids (green `--up`) below. Each level draws a
 * horizontal depth bar whose width is proportional to the *cumulative* size
 * out from the best price, so the book visibly thickens away from the mid.
 *
 * Presentational only — pass already-fetched levels. Restyled Arcade copy of
 * the legacy `src/components/items/order-book.tsx` (left untouched).
 */

export interface OrderLevel {
  price: number;
  qty: number;
}

export interface OrderBookProps {
  /** Buy orders (any order — sorted best-first internally). */
  bids: OrderLevel[];
  /** Sell orders (any order — sorted best-first internally). */
  asks: OrderLevel[];
  /** Card heading. */
  title?: string;
  /** Cap the rows shown per side (keeps the best levels). */
  maxRows?: number;
  /** Price formatter. Defaults to USD with 2 decimals. */
  formatPrice?: (n: number) => string;
  className?: string;
}

interface DepthRow extends OrderLevel {
  /** Cumulative qty out from the best price. */
  cum: number;
}

const defaultMoney = (n: number) =>
  "$" +
  n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/** Sort best-first, optionally cap, then accumulate size outward. */
function buildSide(
  levels: OrderLevel[],
  side: "ask" | "bid",
  maxRows?: number
): DepthRow[] {
  const sorted = [...levels].sort((a, b) =>
    side === "ask" ? a.price - b.price : b.price - a.price
  );
  const capped =
    maxRows && maxRows > 0 ? sorted.slice(0, maxRows) : sorted;
  // Steam's order graph qty is ALREADY cumulative out from the best price
  // (see src/lib/steam/types.ts:118) — use it directly. Re-accumulating it
  // would double-count the depth and over-fill every bar.
  return capped.map((l) => ({ ...l, cum: l.qty }));
}

function DepthLevel({
  row,
  maxCum,
  side,
  formatPrice,
}: {
  row: DepthRow;
  maxCum: number;
  side: "ask" | "bid";
  formatPrice: (n: number) => string;
}) {
  const pct = Math.max(2, Math.round((row.cum / maxCum) * 100));
  const barColor =
    side === "ask"
      ? "color-mix(in srgb, var(--down) 14%, transparent)"
      : "color-mix(in srgb, var(--up) 14%, transparent)";
  return (
    <div className="relative flex items-center justify-between overflow-hidden rounded-[7px] px-[9px] py-1.5 font-mono text-[12.5px]">
      <span
        className="absolute inset-y-0 right-0"
        style={{ width: `${pct}%`, background: barColor }}
        aria-hidden="true"
      />
      <span
        className={cn(
          "relative font-bold",
          side === "ask" ? "text-down" : "text-up"
        )}
      >
        {formatPrice(row.price)}
      </span>
      <span className="relative text-mut">{row.qty.toLocaleString()}</span>
    </div>
  );
}

export function OrderBook({
  bids,
  asks,
  title = "Order book",
  maxRows,
  formatPrice = defaultMoney,
  className,
}: OrderBookProps) {
  const askRows = buildSide(asks, "ask", maxRows);
  const bidRows = buildSide(bids, "bid", maxRows);

  const askTotal = askRows.length ? askRows[askRows.length - 1].cum : 0;
  const bidTotal = bidRows.length ? bidRows[bidRows.length - 1].cum : 0;
  const maxCum = Math.max(askTotal, bidTotal, 1);

  const bestAsk = askRows.length ? askRows[0].price : null;
  const bestBid = bidRows.length ? bidRows[0].price : null;
  const showSpread = bestAsk !== null && bestBid !== null;
  const spread = showSpread ? bestAsk! - bestBid! : 0;
  const mid = showSpread ? (bestAsk! + bestBid!) / 2 : 0;
  const spreadPct = showSpread && mid > 0 ? (spread / mid) * 100 : 0;

  return (
    <div
      className={cn(
        "rounded-[18px] border border-line bg-panel p-5",
        className
      )}
    >
      <div className="mb-3.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <h2 className="font-display text-[18px] font-bold text-tx">{title}</h2>
          <Tooltip
            asIcon
            content="Live buy and sell orders from the Steam Market. Sell orders (asks) stack above the spread, buy orders (bids) below. Bar width shows cumulative depth out from the best price."
          />
        </div>
        <span className="font-mono text-[11px] text-faint">PRICE · QTY</span>
      </div>

      {/* Asks — lowest sits just above the spread (column-reverse). */}
      <div className="flex flex-col-reverse gap-[3px]">
        {askRows.map((row, i) => (
          <DepthLevel
            key={`ask-${i}-${row.price}`}
            row={row}
            maxCum={maxCum}
            side="ask"
            formatPrice={formatPrice}
          />
        ))}
      </div>

      {showSpread && (
        <div className="my-[7px] flex items-center justify-between border-y border-line px-[9px] py-[11px]">
          <span className="flex items-center gap-1 text-[11px] text-faint">
            Spread
            <Tooltip
              asIcon
              content="The gap between the lowest sell and the highest buy. Narrow = liquid, easy to trade near market price. Wide = illiquid and potentially volatile."
            />
          </span>
          <span className="font-mono text-[14px] font-bold text-tx">
            {formatPrice(spread)}{" "}
            <span className="text-[12px] font-medium text-faint">
              {spreadPct.toFixed(1)}%
            </span>
          </span>
        </div>
      )}

      {/* Bids — highest sits just below the spread. */}
      <div className="flex flex-col gap-[3px]">
        {bidRows.map((row, i) => (
          <DepthLevel
            key={`bid-${i}-${row.price}`}
            row={row}
            maxCum={maxCum}
            side="bid"
            formatPrice={formatPrice}
          />
        ))}
      </div>
    </div>
  );
}
