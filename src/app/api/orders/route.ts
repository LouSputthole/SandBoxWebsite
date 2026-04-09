import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fetchItemNameId, fetchOrderHistogram } from "@/lib/steam/client";
import { cached } from "@/lib/redis/cache";

/**
 * GET /api/orders?slug=<item_slug>
 *
 * Fetches buy/sell order data from Steam's order histogram for an item.
 * Caches item_nameid (permanent) and order data (5 minutes).
 */
export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("slug");
  if (!slug) {
    return NextResponse.json({ error: "Missing 'slug' parameter" }, { status: 400 });
  }

  const item = await prisma.item.findUnique({
    where: { slug },
    select: { steamMarketId: true, name: true },
  });

  if (!item || !item.steamMarketId) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  // Get item_nameid (cached for 30 days since it never changes)
  const itemNameId = await cached<string | null>(
    `steam:nameid:${item.steamMarketId}`,
    60 * 60 * 24 * 30,
    () => fetchItemNameId(item.steamMarketId!)
  );

  if (!itemNameId) {
    return NextResponse.json(
      { error: "Could not resolve Steam item ID. Try again later." },
      { status: 502 }
    );
  }

  // Get order histogram (cached for 5 minutes)
  const histogram = await cached(
    `orders:${itemNameId}`,
    60 * 5,
    () => fetchOrderHistogram(itemNameId)
  );

  if (!histogram || histogram.success !== 1) {
    return NextResponse.json(
      { error: "Could not fetch order data from Steam." },
      { status: 502 }
    );
  }

  // Transform into a cleaner response
  const highestBuyOrder = histogram.highest_buy_order
    ? parseInt(histogram.highest_buy_order, 10) / 100
    : null;
  const lowestSellOrder = histogram.lowest_sell_order
    ? parseInt(histogram.lowest_sell_order, 10) / 100
    : null;

  // Steam sometimes returns HTML in count fields — strip tags and extract number
  const parseCount = (val: string) => {
    const stripped = val.replace(/<[^>]*>/g, "").replace(/[,\s]/g, "");
    return parseInt(stripped, 10) || 0;
  };

  // Take top 10 entries from each side of the order book
  const buyOrders = histogram.buy_order_graph.slice(0, 10).map(([price, qty]) => ({
    price,
    quantity: qty,
  }));

  const sellOrders = histogram.sell_order_graph.slice(0, 10).map(([price, qty]) => ({
    price,
    quantity: qty,
  }));

  return NextResponse.json({
    highestBuyOrder,
    lowestSellOrder,
    buyOrderCount: parseCount(histogram.buy_order_count),
    sellOrderCount: parseCount(histogram.sell_order_count),
    buyOrders,
    sellOrders,
  });
}
