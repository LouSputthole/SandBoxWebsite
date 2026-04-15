"use client";

import { useState, useEffect } from "react";
import { ArrowLeftRight, TrendingUp, AlertTriangle, Loader2 } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import { Tooltip } from "@/components/ui/tooltip";

interface OrderEntry {
  price: number;
  quantity: number;
}

interface OrderData {
  highestBuyOrder: number | null;
  lowestSellOrder: number | null;
  buyOrderCount: number;
  sellOrderCount: number;
  buyOrders: OrderEntry[];
  sellOrders: OrderEntry[];
}

export function SpreadAnalysis({ slug }: { slug: string }) {
  const [data, setData] = useState<OrderData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/orders?slug=${encodeURIComponent(slug)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => setData(json))
      .catch(() => setData(null)) // explicit null so UI shows "no data" instead of hanging on loading
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6 text-neutral-500 text-sm gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Analyzing spread...
      </div>
    );
  }

  if (!data || data.highestBuyOrder == null || data.lowestSellOrder == null) {
    return null; // Not enough data, hide the section
  }

  const spread = data.lowestSellOrder - data.highestBuyOrder;
  const spreadPct =
    data.highestBuyOrder > 0
      ? (spread / data.highestBuyOrder) * 100
      : 0;
  const midpoint = (data.lowestSellOrder + data.highestBuyOrder) / 2;

  // Calculate buy/sell pressure
  const totalBuyQty = data.buyOrders.reduce((s, o) => s + o.quantity, 0);
  const totalSellQty = data.sellOrders.reduce((s, o) => s + o.quantity, 0);
  const totalQty = totalBuyQty + totalSellQty;
  const buyPressure = totalQty > 0 ? (totalBuyQty / totalQty) * 100 : 50;

  // Depth within 10% of midpoint
  const depthBand = midpoint * 0.1;
  const nearBuyQty = data.buyOrders
    .filter((o) => o.price >= midpoint - depthBand)
    .reduce((s, o) => s + o.quantity, 0);
  const nearSellQty = data.sellOrders
    .filter((o) => o.price <= midpoint + depthBand)
    .reduce((s, o) => s + o.quantity, 0);

  // Market signals
  const isWideSpread = spreadPct > 20;
  const isBuyHeavy = buyPressure > 65;
  const isSellHeavy = buyPressure < 35;

  let signal: { label: string; color: string; description: string };
  if (isBuyHeavy && !isWideSpread) {
    signal = {
      label: "Bullish Pressure",
      color: "text-emerald-400",
      description: "Strong buy interest relative to sell orders — price may move up.",
    };
  } else if (isSellHeavy && !isWideSpread) {
    signal = {
      label: "Bearish Pressure",
      color: "text-red-400",
      description: "Heavy sell-side pressure — price may face downward movement.",
    };
  } else if (isWideSpread) {
    signal = {
      label: "Low Liquidity",
      color: "text-amber-400",
      description: "Wide bid-ask spread suggests thin order book. Prices may be volatile.",
    };
  } else {
    signal = {
      label: "Balanced",
      color: "text-neutral-300",
      description: "Even buy/sell pressure with a reasonable spread.",
    };
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-medium text-neutral-300">Spread Analysis</h3>
        <Tooltip
          asIcon
          content={
            <>
              <span className="block mb-1 font-medium text-white">Spread Analysis</span>
              Measures how tight or loose the market is. Narrow spread + balanced orders = healthy liquidity. Wide spread or one-sided pressure suggests volatility or thin trading.
            </>
          }
        />
      </div>

      {/* Spread stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg bg-neutral-800/50 px-3 py-2.5">
          <div className="flex items-center gap-1.5 mb-1">
            <ArrowLeftRight className="h-3 w-3 text-neutral-500" />
            <span className="text-[10px] text-neutral-500">Spread</span>
            <Tooltip
              asIcon
              content="The gap between the lowest sell price and the highest buy price. Narrow = liquid, easy to buy/sell near market price. Wide = illiquid, costly to enter/exit."
            />
          </div>
          <div className="text-sm font-semibold text-white">
            {formatPrice(spread)}
          </div>
          <div className="text-[10px] text-neutral-500">
            {spreadPct.toFixed(1)}%
          </div>
        </div>
        <div className="rounded-lg bg-neutral-800/50 px-3 py-2.5">
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingUp className="h-3 w-3 text-neutral-500" />
            <span className="text-[10px] text-neutral-500">Midpoint</span>
            <Tooltip
              asIcon
              content="The average of the highest buy order and lowest sell order. A reasonable estimate of the item's current fair market value."
            />
          </div>
          <div className="text-sm font-semibold text-white">
            {formatPrice(midpoint)}
          </div>
        </div>
        <div className="rounded-lg bg-neutral-800/50 px-3 py-2.5">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-[10px] text-neutral-500">Near Buy Depth</span>
            <Tooltip
              asIcon
              content="Number of items buyers want to purchase within 10% of the midpoint price. High near-buy depth means strong demand close to market rate."
            />
          </div>
          <div className="text-sm font-semibold text-emerald-400">
            {nearBuyQty.toLocaleString()}
          </div>
        </div>
        <div className="rounded-lg bg-neutral-800/50 px-3 py-2.5">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-[10px] text-neutral-500">Near Sell Depth</span>
            <Tooltip
              asIcon
              content="Number of items sellers have listed within 10% of the midpoint price. High near-sell depth means plenty of supply close to market rate."
            />
          </div>
          <div className="text-sm font-semibold text-red-400">
            {nearSellQty.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Buy/Sell Pressure Bar */}
      <div>
        <div className="flex items-center justify-between text-[10px] text-neutral-500 mb-1.5">
          <span>Buy Pressure ({buyPressure.toFixed(0)}%)</span>
          <span>Sell Pressure ({(100 - buyPressure).toFixed(0)}%)</span>
        </div>
        <div className="h-2 rounded-full bg-neutral-800 overflow-hidden flex">
          <div
            className="h-full bg-emerald-500/70 transition-all"
            style={{ width: `${buyPressure}%` }}
          />
          <div
            className="h-full bg-red-500/70 transition-all"
            style={{ width: `${100 - buyPressure}%` }}
          />
        </div>
      </div>

      {/* Signal */}
      <div className="flex items-start gap-2 rounded-lg bg-neutral-800/30 px-3 py-2.5">
        {isWideSpread ? (
          <AlertTriangle className={`h-4 w-4 mt-0.5 ${signal.color}`} />
        ) : (
          <TrendingUp className={`h-4 w-4 mt-0.5 ${signal.color}`} />
        )}
        <div>
          <div className={`text-xs font-medium ${signal.color}`}>
            {signal.label}
          </div>
          <p className="text-[11px] text-neutral-500 mt-0.5">
            {signal.description}
          </p>
        </div>
      </div>
    </div>
  );
}
