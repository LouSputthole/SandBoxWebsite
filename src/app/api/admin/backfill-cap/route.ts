import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(request: NextRequest) {
  const key =
    request.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
  if (
    key !== process.env.CRON_SECRET &&
    key !== process.env.ANALYTICS_KEY
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Current items with supply — used to compute the ratio
  const items = await prisma.item.findMany({
    select: { currentPrice: true, volume: true, totalSupply: true },
  });

  const currentListingsValue = items.reduce(
    (sum, i) => sum + (i.currentPrice ?? 0) * (i.volume ?? 0),
    0,
  );
  const itemsWithSupply = items.filter(
    (i) =>
      i.totalSupply != null && i.totalSupply > 0 && (i.currentPrice ?? 0) > 0,
  );
  const currentEstCap = itemsWithSupply.reduce(
    (sum, i) => sum + (i.currentPrice ?? 0) * (i.totalSupply ?? 0),
    0,
  );

  if (currentListingsValue <= 0 || currentEstCap <= 0) {
    return NextResponse.json({
      error: "Not enough current data to compute ratio",
    });
  }

  // ratio = estMarketCap / listingsValue (right now)
  // For old snapshots: estMarketCap ≈ listingsValue_then * ratio
  const ratio = currentEstCap / currentListingsValue;

  const nullSnapshots = await prisma.marketSnapshot.findMany({
    where: { estMarketCap: null },
    select: { id: true, listingsValue: true },
  });

  let updated = 0;
  for (const snap of nullSnapshots) {
    const est = snap.listingsValue * ratio;
    await prisma.marketSnapshot.update({
      where: { id: snap.id },
      data: { estMarketCap: est },
    });
    updated++;
  }

  return NextResponse.json({
    ratio: ratio.toFixed(4),
    currentEstCap,
    currentListingsValue,
    snapshotsUpdated: updated,
    totalSnapshots: nullSnapshots.length,
  });
}
