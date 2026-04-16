import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const revalidate = 600;

/**
 * GET /api/export?format=csv — full item dataset as CSV.
 * GET /api/export?format=json — full item dataset as JSON (minus heavy fields).
 *
 * Designed for power users, analysts, and anyone who wants raw data for
 * their own charts / Reddit posts / spreadsheets.
 */
export async function GET(request: NextRequest) {
  const format = request.nextUrl.searchParams.get("format") ?? "csv";

  const items = await prisma.item.findMany({
    orderBy: { currentPrice: "desc" },
    select: {
      name: true,
      slug: true,
      type: true,
      category: true,
      itemSubType: true,
      itemDisplayName: true,
      currentPrice: true,
      lowestPrice: true,
      medianPrice: true,
      priceChange24h: true,
      priceChange6hPercent: true,
      volume: true,
      totalSupply: true,
      uniqueOwners: true,
      soldPast24h: true,
      supplyOnMarket: true,
      totalSales: true,
      scarcityScore: true,
      releaseDate: true,
      releasePrice: true,
      isActiveStoreItem: true,
      leavingStoreAt: true,
      storeStatus: true,
      marketUrl: true,
    },
  });

  if (format === "json") {
    return NextResponse.json(
      {
        generatedAt: new Date().toISOString(),
        count: items.length,
        items,
      },
      {
        headers: {
          "Cache-Control": "public, max-age=600, s-maxage=600",
        },
      },
    );
  }

  // CSV
  const columns = [
    "name",
    "slug",
    "type",
    "category",
    "itemSubType",
    "itemDisplayName",
    "currentPrice",
    "lowestPrice",
    "medianPrice",
    "priceChange24h",
    "priceChange6hPercent",
    "volume",
    "totalSupply",
    "uniqueOwners",
    "soldPast24h",
    "supplyOnMarket",
    "totalSales",
    "scarcityScore",
    "releaseDate",
    "releasePrice",
    "isActiveStoreItem",
    "leavingStoreAt",
    "storeStatus",
    "marketUrl",
  ] as const;

  const rows = [columns.join(",")];
  for (const item of items) {
    rows.push(
      columns
        .map((col) => {
          const v = (item as Record<string, unknown>)[col];
          if (v == null) return "";
          if (v instanceof Date) return v.toISOString();
          const s = String(v);
          // Quote if contains comma, quote, or newline
          if (s.includes(",") || s.includes('"') || s.includes("\n")) {
            return `"${s.replace(/"/g, '""')}"`;
          }
          return s;
        })
        .join(","),
    );
  }

  const csv = rows.join("\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="sboxskins-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "public, max-age=600, s-maxage=600",
    },
  });
}
