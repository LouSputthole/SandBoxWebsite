import { NextRequest, NextResponse } from "next/server";
import { captureSupplySnapshots } from "@/lib/services/sync-service";

/**
 * Daily cron — snapshots every item's totalSupply + uniqueOwners + price
 * into the SupplySnapshot timeseries table. Powers per-item "supply over
 * time" charts and trend analysis.
 */
async function handle(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await captureSupplySnapshots();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
