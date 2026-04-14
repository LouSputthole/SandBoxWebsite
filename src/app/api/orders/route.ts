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

  try {
    const item = await prisma.item.findUnique({
      where: { slug },
      select: { steamMarketId: true, steamItemNameId: true, name: true },
    });

    if (!item || !item.steamMarketId) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    if (!item.steamItemNameId) {
      return NextResponse.json(
        {
          error: "Order data pending — item name ID not yet scraped.",
          needsScrape: true,
        },
        { status: 503 },
      );
    }

    // Fetch order histogram from Steam (cached for 5 minutes).
    // Skip the rate limiter for this endpoint — it's user-facing and only
    // hits one Steam URL per request.
    const histogram = await cached(
      `orders:${item.steamItemNameId}`,
      60 * 5,
      () => fetchOrderHistogram(item.steamItemNameId!),
    );

    if (!histogram || histogram.success !== 1) {
      return NextResponse.json(
        { error: "Could not fetch order data from Steam.", steamItemNameId: item.steamItemNameId },
        { status: 502 },
      );
    }

    const highestBuyOrder = histogram.highest_buy_order
      ? parseInt(histogram.highest_buy_order, 10) / 100
      : null;
    const lowestSellOrder = histogram.lowest_sell_order
      ? parseInt(histogram.lowest_sell_order, 10) / 100
      : null;

    // Extract order counts from the summary HTML.
    // Format: '<span class="...">611</span> requests to buy...'
    const extractCount = (html: string | undefined): number => {
      if (!html) return 0;
      const match = html.match(/>(\d[\d,]*)</);
      if (match) return parseInt(match[1].replace(/,/g, ""), 10) || 0;
      // Fallback: strip all tags, grab first number
      const stripped = html.replace(/<[^>]*>/g, "").replace(/[,\s]/g, "");
      return parseInt(stripped, 10) || 0;
    };

    const buyOrders = (histogram.buy_order_graph ?? []).slice(0, 10).map(([price, qty]) => ({
      price,
      quantity: qty,
    }));

    const sellOrders = (histogram.sell_order_graph ?? []).slice(0, 10).map(([price, qty]) => ({
      price,
      quantity: qty,
    }));

    return NextResponse.json({
      highestBuyOrder,
      lowestSellOrder,
      buyOrderCount: extractCount(histogram.buy_order_summary),
      sellOrderCount: extractCount(histogram.sell_order_summary),
      buyOrders,
      sellOrders,
    });
  } catch (error) {
    console.error("[orders] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch orders", details: String(error) },
      { status: 500 },
    );
  }
}
