import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const revalidate = 600;

/**
 * GET /api/export — full item dataset as CSV for download.
 *
 * Deliberately CSV-only. No JSON endpoint here — we don't want competitors
 * trivially harvesting our derived metrics (scarcity score, etc.) via a
 * poll-friendly API. CSV is download-once-a-day behavior, JSON invites
 * hourly polling. Add a JSON endpoint later if we actively want third-party
 * integrators, gated behind an API key.
 */
export async function GET() {
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
          let s = String(v);
          // CSV formula injection defense: Excel/Sheets execute any cell
          // starting with =, @, +, -, \t, \r as a formula. We prefix with a
          // single quote (Excel convention to force text). The prefix is
          // then included in the quoted field so it survives escaping.
          if (/^[=@+\-\t\r]/.test(s)) {
            s = `'${s}`;
          }
          // Quote if contains comma, quote, or newline (or was prefixed above)
          if (s.includes(",") || s.includes('"') || s.includes("\n") || s.startsWith("'")) {
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
