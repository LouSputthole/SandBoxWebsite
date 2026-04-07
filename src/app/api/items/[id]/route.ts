import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { cached, CACHE_TTL } from "@/lib/redis/cache";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const item = await cached(`item:${id}`, CACHE_TTL.ITEM_DETAIL, async () => {
    return prisma.item.findFirst({
      where: {
        OR: [{ id }, { slug: id }],
      },
      include: {
        priceHistory: {
          orderBy: { timestamp: "desc" },
          take: 90,
        },
      },
    });
  });

  if (!item) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  return NextResponse.json(item);
}
