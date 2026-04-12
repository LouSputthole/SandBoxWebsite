import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const { slugs } = (await request.json()) as { slugs: string[] };

    if (!Array.isArray(slugs) || slugs.length === 0) {
      return NextResponse.json({ items: [], totalValue: 0 });
    }

    // Cap at 100 items
    const capped = slugs.slice(0, 100);

    const items = await prisma.item.findMany({
      where: { slug: { in: capped } },
      select: {
        id: true,
        name: true,
        slug: true,
        type: true,
        rarity: true,
        imageUrl: true,
        currentPrice: true,
        lowestPrice: true,
        medianPrice: true,
        priceChange24h: true,
        volume: true,
        isLimited: true,
        storeStatus: true,
      },
    });

    const totalValue = items.reduce(
      (sum, item) => sum + (item.currentPrice ?? 0),
      0,
    );

    const totalChange = items.reduce(
      (sum, item) => sum + (item.priceChange24h ?? 0),
      0,
    );

    const gainers = items
      .filter((i) => (i.priceChange24h ?? 0) > 0)
      .sort((a, b) => (b.priceChange24h ?? 0) - (a.priceChange24h ?? 0));

    const losers = items
      .filter((i) => (i.priceChange24h ?? 0) < 0)
      .sort((a, b) => (a.priceChange24h ?? 0) - (b.priceChange24h ?? 0));

    return NextResponse.json({
      items,
      totalValue,
      totalChange,
      itemCount: items.length,
      gainers: gainers.length,
      losers: losers.length,
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch portfolio" },
      { status: 500 },
    );
  }
}
