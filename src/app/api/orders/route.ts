import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fetchOrderHistogram } from "@/lib/steam/client";
import { cached } from "@/lib/redis/cache";

/**
 * GET /api/orders?slug=<item_slug>
 *
 * Fetches buy/sell order data from Steam's order histogram for an item.
 * Requires the item to have a steamItemNameId (populated by the nameids scraper).
 * The histogram JSON endpoint works from Vercel, but scraping the nameid does not.
 */
export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("slug");
  if (!slug) {
    return NextResponse.json({ error: "Missing 'slug' parameter" }, { status: 400 });
  }

  const item = await prisma.item.findUnique({
    where: { slug },
    select: { steamMarketId: true, steamItemNameId: true, name: true },
  });

  if (!item || !item.steamMarketId) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  // The steamItemNameId must be pre-populated by the GitHub Actions scraper.
  // We can't scrape it from Vercel because Steam blocks listing page HTML from data center IPs.
  if (!item.steamItemNameId) {
    return NextResponse.json(
      {
        error: "Order data pending — item name ID not yet scraped. Run the nameids GitHub Action.",
        needsScrape: true,
      },
      { status: 503 },
    );
  }

  // Get order histogram (cached for 5 minutes)
  const histogram = await cached(
    `orders:${item.steamItemNameId}`,
    60 * 5,
    () => fetchOrderHistogram(item.steamItemNameId!),
  );

  if (!histogram || histogram.success !== 1) {
    return NextResponse.json(
      { error: "Could not fetch order data from Steam." },
      { status: 502 },
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
