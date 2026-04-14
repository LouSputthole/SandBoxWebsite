"use client";

import { useState, useEffect } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Loader2 } from "lucide-react";
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

export function OrderBook({ slug }: { slug: string }) {
  const [data, setData] = useState<OrderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrders = () => {
    setLoading(true);
    setError(null);

    fetch(`/api/orders?slug=${encodeURIComponent(slug)}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "Failed to fetch orders");
        }
        return res.json();
      })
      .then((json) => setData(json))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-neutral-500 text-sm gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading order book...
      </div>
    );
  }

  if (error || !data) {
    const isPending = error?.includes("pending") || error?.includes("not yet");
    return (
      <div className="text-center py-6 space-y-2">
        <p className="text-neutral-600 text-sm">
          {isPending
            ? "Order data is being set up — check back soon."
            : error || "Order data unavailable"}
        </p>
        {!isPending && (
          <button
            onClick={fetchOrders}
            className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
          >
            Try again
          </button>
        )}
      </div>
    );
  }

  const maxBuyQty = Math.max(...data.buyOrders.map((o) => o.quantity), 1);
  const maxSellQty = Math.max(...data.sellOrders.map((o) => o.quantity), 1);

  return (
    <div>
      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/20 px-4 py-3">
          <div className="flex items-center gap-2 mb-1">
            <ArrowUpFromLine className="h-3.5 w-3.5 text-emerald-400" />
            <span className="text-xs text-neutral-400">Highest Buy Order</span>
            <Tooltip
              asIcon
              content="The most anyone is currently offering to pay for this item. If you list at or below this price, you'll sell instantly to this buyer."
            />
          </div>
          <div className="text-lg font-bold text-emerald-400">
            {data.highestBuyOrder != null ? `$${data.highestBuyOrder.toFixed(2)}` : "—"}
          </div>
          <div className="flex items-center gap-1 text-[10px] text-neutral-500 mt-0.5">
            <span>{data.buyOrderCount.toLocaleString()} total buy order{data.buyOrderCount !== 1 ? "s" : ""}</span>
            <Tooltip
              asIcon
              content={
                <>
                  <span className="block mb-1 font-medium text-white">Buy Depth</span>
                  Total number of people waiting to buy this item at various prices. High buy depth = strong demand — if prices drop, many buyers are ready to purchase. Low buy depth = weak demand.
                </>
              }
            />
          </div>
        </div>
        <div className="rounded-lg bg-red-500/5 border border-red-500/20 px-4 py-3">
          <div className="flex items-center gap-2 mb-1">
            <ArrowDownToLine className="h-3.5 w-3.5 text-red-400" />
            <span className="text-xs text-neutral-400">Lowest Sell Order</span>
            <Tooltip
              asIcon
              content="The cheapest current listing on the Steam Market. This is the price you'd pay to buy one right now. Place a buy order at or above this and you'll purchase instantly."
            />
          </div>
          <div className="text-lg font-bold text-red-400">
            {data.lowestSellOrder != null ? `$${data.lowestSellOrder.toFixed(2)}` : "—"}
          </div>
          <div className="flex items-center gap-1 text-[10px] text-neutral-500 mt-0.5">
            <span>{data.sellOrderCount.toLocaleString()} total sell order{data.sellOrderCount !== 1 ? "s" : ""}</span>
            <Tooltip
              asIcon
              content={
                <>
                  <span className="block mb-1 font-medium text-white">Sell Depth</span>
                  Total individual items currently for sale across all listings. This can be higher than the &ldquo;Listings&rdquo; count when sellers list multiple copies in a single listing.
                </>
              }
            />
          </div>
        </div>
      </div>

      {/* Order tables side by side */}
      <div className="grid grid-cols-2 gap-3">
        {/* Buy orders */}
        <div>
          <div className="flex items-center gap-1 mb-2 px-1">
            <span className="text-[10px] uppercase tracking-wider text-neutral-500">Buy Orders</span>
            <Tooltip
              asIcon
              content="People offering to buy at specific prices. If nobody's selling at your target price, you can place a buy order and wait for the price to drop to your level."
            />
          </div>
          <div className="space-y-0.5">
            {data.buyOrders.length === 0 ? (
              <div className="text-xs text-neutral-600 px-1">No buy orders</div>
            ) : (
              data.buyOrders.map((order, i) => (
                <div key={i} className="relative flex items-center justify-between px-2 py-1 rounded text-xs">
                  <div
                    className="absolute inset-0 rounded bg-emerald-500/10"
                    style={{ width: `${(order.quantity / maxBuyQty) * 100}%` }}
                  />
                  <span className="relative text-emerald-400 font-medium">
                    ${order.price.toFixed(2)}
                  </span>
                  <span className="relative text-neutral-400">
                    {order.quantity.toLocaleString()}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Sell orders */}
        <div>
          <div className="flex items-center gap-1 mb-2 px-1">
            <span className="text-[10px] uppercase tracking-wider text-neutral-500">Sell Orders</span>
            <Tooltip
              asIcon
              content="Items currently for sale at specific prices. The lowest sell price is what you'd pay to buy right now. Higher-priced sell orders only fill after lower ones sell out."
            />
          </div>
          <div className="space-y-0.5">
            {data.sellOrders.length === 0 ? (
              <div className="text-xs text-neutral-600 px-1">No sell orders</div>
            ) : (
              data.sellOrders.map((order, i) => (
                <div key={i} className="relative flex items-center justify-between px-2 py-1 rounded text-xs">
                  <div
                    className="absolute inset-0 rounded bg-red-500/10 right-0 left-auto"
                    style={{ width: `${(order.quantity / maxSellQty) * 100}%`, marginLeft: "auto" }}
                  />
                  <span className="relative text-red-400 font-medium">
                    ${order.price.toFixed(2)}
                  </span>
                  <span className="relative text-neutral-400">
                    {order.quantity.toLocaleString()}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
