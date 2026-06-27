"use client";

import { useEffect, useState } from "react";

/**
 * Shared `/api/orders` fetch for the item detail page. Both the order-book
 * summary/ladder and the spread-analysis panel read the same Steam order
 * histogram, so we fetch it ONCE here and hand the result to both consumers
 * (lifted into <ItemDetail>) instead of each component firing its own request.
 */

export interface ApiOrder {
  price: number;
  quantity: number;
}

export interface OrdersData {
  highestBuyOrder: number | null;
  lowestSellOrder: number | null;
  buyOrderCount: number;
  sellOrderCount: number;
  buyOrders: ApiOrder[];
  sellOrders: ApiOrder[];
}

export interface UseOrders {
  data: OrdersData | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useOrders(slug: string): UseOrders {
  const [data, setData] = useState<OrdersData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = () => {
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
      .then((json: OrdersData) => setData(json))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  return { data, loading, error, reload };
}
