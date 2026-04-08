import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { cached, cacheKey, CACHE_TTL } from "@/lib/redis/cache";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const q = searchParams.get("q") || "";
  const type = searchParams.get("type") || "";
  const rarity = searchParams.get("rarity") || "";
  const minPrice = searchParams.get("minPrice") || "";
  const maxPrice = searchParams.get("maxPrice") || "";
  const sort = searchParams.get("sort") || "name-asc";
  const page = searchParams.get("page") || "1";
  const limit = searchParams.get("limit") || "12";

  const key = cacheKey("items", { q, type, rarity, minPrice, maxPrice, sort, page, limit });

  const data = await cached(key, CACHE_TTL.ITEMS_LIST, async () => {
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    const where: Prisma.ItemWhereInput = {};
    if (q) {
      where.name = { contains: q, mode: "insensitive" };
    }
    if (type) {
      where.type = type;
    }
    if (rarity) {
      where.rarity = rarity;
    }
    if (minPrice || maxPrice) {
      where.currentPrice = {};
      if (minPrice) where.currentPrice.gte = parseFloat(minPrice);
      if (maxPrice) where.currentPrice.lte = parseFloat(maxPrice);
    }

    const orderBy: Prisma.ItemOrderByWithRelationInput = {};
    switch (sort) {
      case "price-asc":
        orderBy.currentPrice = "asc";
        break;
      case "price-desc":
        orderBy.currentPrice = "desc";
        break;
      case "name-asc":
        orderBy.name = "asc";
        break;
      case "name-desc":
        orderBy.name = "desc";
        break;
      case "volume-asc":
        orderBy.volume = "asc";
        break;
      case "volume-desc":
        orderBy.volume = "desc";
        break;
      case "change-asc":
        orderBy.priceChange24h = "asc";
        break;
      case "change-desc":
        orderBy.priceChange24h = "desc";
        break;
      default:
        orderBy.name = "asc";
    }

    const [items, total] = await Promise.all([
      prisma.item.findMany({
        where,
        orderBy,
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      }),
      prisma.item.count({ where }),
    ]);

    return {
      items,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    };
  });

  return NextResponse.json(data);
}
