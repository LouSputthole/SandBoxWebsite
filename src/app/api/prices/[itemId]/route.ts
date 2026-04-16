import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { cached, CACHE_TTL } from "@/lib/redis/cache";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const { itemId } = await params;
  const searchParams = request.nextUrl.searchParams;
  const period = searchParams.get("period") || "30d";

  const data = await cached(
    `prices:${itemId}:${period}`,
    CACHE_TTL.PRICE_HISTORY,
    async () => {
      let daysBack = 30;
      switch (period) {
        case "24h":
          daysBack = 1;
          break;
        case "7d":
          daysBack = 7;
          break;
        case "30d":
          daysBack = 30;
          break;
        case "90d":
          daysBack = 90;
          break;
        case "all":
          daysBack = 365;
          break;
      }

      const since = new Date();
      since.setDate(since.getDate() - daysBack);

      return prisma.pricePoint.findMany({
        where: {
          itemId,
          timestamp: { gte: since },
        },
        orderBy: { timestamp: "asc" },
      });
    }
  );

  return NextResponse.json(data);
}
