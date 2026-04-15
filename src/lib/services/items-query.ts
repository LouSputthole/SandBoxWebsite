import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Server-side items query — same logic as /api/items but callable directly
 * from Server Components without going through HTTP.
 */

export interface ItemsQueryParams {
  q?: string;
  type?: string;
  minPrice?: string;
  maxPrice?: string;
  sort?: string;
  page?: string | number;
  limit?: string | number;
  hasSupply?: string;
  isLimited?: string;
}

export interface ItemsQueryResult {
  items: {
    id: string;
    name: string;
    slug: string;
    type: string;
    imageUrl: string | null;
    currentPrice: number | null;
    lowestPrice: number | null;
    medianPrice: number | null;
    priceChange24h: number | null;
    volume: number | null;
    totalSupply: number | null;
    isLimited: boolean;
  }[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  lastUpdated: Date | null;
}

export async function getItems(params: ItemsQueryParams): Promise<ItemsQueryResult> {
  const pageNum = Math.max(1, parseInt(String(params.page ?? "1")) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(String(params.limit ?? "12")) || 12));

  const where: Prisma.ItemWhereInput = {};
  if (params.q) {
    where.name = { contains: params.q, mode: "insensitive" };
  }
  if (params.type) {
    where.type = params.type;
  }
  if (params.minPrice || params.maxPrice) {
    where.currentPrice = {};
    if (params.minPrice) where.currentPrice.gte = parseFloat(params.minPrice);
    if (params.maxPrice) where.currentPrice.lte = parseFloat(params.maxPrice);
  }
  if (params.hasSupply === "true") {
    where.totalSupply = { not: null, gt: 0 };
  }
  if (params.isLimited === "true") {
    where.isLimited = true;
  }

  const orderBy: Prisma.ItemOrderByWithRelationInput = {};
  switch (params.sort) {
    case "price-asc": orderBy.currentPrice = "asc"; break;
    case "price-desc": orderBy.currentPrice = "desc"; break;
    case "name-desc": orderBy.name = "desc"; break;
    case "volume-asc": orderBy.volume = "asc"; break;
    case "volume-desc": orderBy.volume = "desc"; break;
    case "change-asc": orderBy.priceChange24h = "asc"; break;
    case "change-desc": orderBy.priceChange24h = "desc"; break;
    case "supply-asc": orderBy.totalSupply = "asc"; break;
    case "supply-desc": orderBy.totalSupply = "desc"; break;
    default: orderBy.name = "asc";
  }

  const [items, total, lastUpdatedItem] = await Promise.all([
    prisma.item.findMany({
      where,
      orderBy,
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
      select: {
        id: true,
        name: true,
        slug: true,
        type: true,
        imageUrl: true,
        currentPrice: true,
        lowestPrice: true,
        medianPrice: true,
        priceChange24h: true,
        volume: true,
        totalSupply: true,
        isLimited: true,
      },
    }),
    prisma.item.count({ where }),
    prisma.item.findFirst({
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    }),
  ]);

  return {
    items,
    total,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil(total / limitNum),
    lastUpdated: lastUpdatedItem?.updatedAt ?? null,
  };
}
