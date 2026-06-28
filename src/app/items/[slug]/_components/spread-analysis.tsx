"use client";

import {
  AlertTriangle,
  ArrowLeftRight,
  Loader2,
  TrendingUp,
} from "lucide-react";
import { Price } from "@/components/ui/price";
import { Tooltip } from "@/components/ui/tooltip";
import type { UseOrders } from "./use-orders";

/**
 * Spread analysis for the item detail page — spread % + midpoint/fair value,
 * near-buy/near-sell depth, a buy/sell pressure bar, and a liquidity signal.
 * Derived purely from the /api/orders histogram (shared with the order book).
 * Restyled to the Arcade foundation from the legacy spread-analysis.tsx.
 */

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[18px] border border-line bg-panel p-5">
      {children}
    </div>
  );
}

export function SpreadAnalysis({ orders }: { orders: UseOrders }) {
  const { data, loading } = orders;

  if (loading) {
    return (
      <Panel>
        <h2 className="mb-3.5 font-display text-[18px] font-bold text-tx">
          Spread analysis
        </h2>
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-faint">
          <Loader2 className="h-4 w-4 animate-spin" />
          Analyzing spread…
        </div>
      </Panel>
    );
  }

  if (!data || data.highestBuyOrder == null || data.lowestSellOrder == null) {
    return null; // Not enough order data — hide the panel entirely.
  }

  const spread = data.lowestSellOrder - data.highestBuyOrder;
  const spreadPct =
    data.highestBuyOrder > 0 ? (spread / data.highestBuyOrder) * 100 : 0;
  const midpoint = (data.lowestSellOrder + data.highestBuyOrder) / 2;

  const totalBuyQty = data.buyOrders.reduce((s, o) => s + o.quantity, 0);
  const totalSellQty = data.sellOrders.reduce((s, o) => s + o.quantity, 0);
  const totalQty = totalBuyQty + totalSellQty;
  const buyPressure = totalQty > 0 ? (totalBuyQty / totalQty) * 100 : 50;

  // Depth within 10% of the midpoint (near-market liquidity).
  const depthBand = midpoint * 0.1;
  const nearBuyQty = data.buyOrders
    .filter((o) => o.price >= midpoint - depthBand)
    .reduce((s, o) => s + o.quantity, 0);
  const nearSellQty = data.sellOrders
    .filter((o) => o.price <= midpoint + depthBand)
    .reduce((s, o) => s + o.quantity, 0);

  const isWideSpread = spreadPct > 20;
  const isBuyHeavy = buyPressure > 65;
  const isSellHeavy = buyPressure < 35;

  let signal: { label: string; color: string; description: string };
  if (isBuyHeavy && !isWideSpread) {
    signal = {
      label: "Bullish pressure",
      color: "var(--up)",
      description:
        "Strong buy interest relative to sell orders — price may move up.",
    };
  } else if (isSellHeavy && !isWideSpread) {
    signal = {
      label: "Bearish pressure",
      color: "var(--down)",
      description:
        "Heavy sell-side pressure — price may face downward movement.",
    };
  } else if (isWideSpread) {
    signal = {
      label: "Low liquidity",
      color: "var(--cat-tool)",
      description:
        "Wide bid-ask spread suggests a thin order book. Prices may be volatile.",
    };
  } else {
    signal = {
      label: "Balanced",
      color: "var(--mut)",
      description: "Even buy/sell pressure with a reasonable spread.",
    };
  }

  return (
    <Panel>
      <div className="mb-3.5 flex items-center gap-2">
        <ArrowLeftRight className="h-4 w-4 text-mut" />
        <h2 className="font-display text-[18px] font-bold text-tx">
          Spread analysis
        </h2>
        <Tooltip
          asIcon
          content="Measures how tight or loose the market is. Narrow spread + balanced orders = healthy liquidity. A wide spread or one-sided pressure suggests volatility or thin trading."
        />
      </div>

      {/* Spread stats */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Stat
          label="Spread"
          tip="The gap between the lowest sell price and the highest buy price. Narrow = liquid, easy to buy/sell near market price. Wide = illiquid, costly to enter/exit."
        >
          <span className="font-mono text-[15px] font-bold text-tx">
            <Price amount={spread} />
          </span>
          <span className="ml-1.5 font-mono text-[11px] text-faint">
            {spreadPct.toFixed(1)}%
          </span>
        </Stat>
        <Stat
          label="Midpoint"
          tip="The average of the highest buy order and lowest sell order — a reasonable estimate of the item's current fair market value."
        >
          <span className="font-mono text-[15px] font-bold text-tx">
            <Price amount={midpoint} />
          </span>
        </Stat>
        <Stat
          label="Near-buy depth"
          tip="Items buyers want to purchase within 10% of the midpoint price. High near-buy depth means strong demand close to market rate."
        >
          <span className="font-mono text-[15px] font-bold text-up">
            {nearBuyQty.toLocaleString()}
          </span>
        </Stat>
        <Stat
          label="Near-sell depth"
          tip="Items sellers have listed within 10% of the midpoint price. High near-sell depth means plenty of supply close to market rate."
        >
          <span className="font-mono text-[15px] font-bold text-down">
            {nearSellQty.toLocaleString()}
          </span>
        </Stat>
      </div>

      {/* Buy / sell pressure bar */}
      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between text-[11px] text-faint">
          <span>Buy pressure ({buyPressure.toFixed(0)}%)</span>
          <span>Sell pressure ({(100 - buyPressure).toFixed(0)}%)</span>
        </div>
        <div className="flex h-2 overflow-hidden rounded-[4px] bg-bg2">
          <div
            className="h-full"
            style={{
              width: `${buyPressure}%`,
              background: "color-mix(in srgb, var(--up) 72%, transparent)",
            }}
          />
          <div
            className="h-full"
            style={{
              width: `${100 - buyPressure}%`,
              background: "color-mix(in srgb, var(--down) 72%, transparent)",
            }}
          />
        </div>
      </div>

      {/* Liquidity signal */}
      <div className="mt-4 flex items-start gap-2.5 rounded-[12px] border border-line bg-bg2 px-3 py-2.5">
        {isWideSpread ? (
          <AlertTriangle
            className="mt-0.5 h-4 w-4 shrink-0"
            style={{ color: signal.color }}
          />
        ) : (
          <TrendingUp
            className="mt-0.5 h-4 w-4 shrink-0"
            style={{ color: signal.color }}
          />
        )}
        <div>
          <div
            className="text-[12.5px] font-bold"
            style={{ color: signal.color }}
          >
            {signal.label}
          </div>
          <p className="mt-0.5 text-[11.5px] text-faint">{signal.description}</p>
        </div>
      </div>
    </Panel>
  );
}

function Stat({
  label,
  tip,
  children,
}: {
  label: string;
  tip?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[12px] border border-line bg-bg2 px-3 py-2.5">
      <div className="mb-1 flex items-center gap-1 text-[10.5px] text-faint">
        {label}
        {tip && <Tooltip asIcon content={tip} />}
      </div>
      <div className="flex items-baseline">{children}</div>
    </div>
  );
}
