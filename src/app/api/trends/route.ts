import { NextRequest, NextResponse } from "next/server";
import { cached, CACHE_TTL } from "@/lib/redis/cache";
import { getTrendsData, type TrendsPeriod } from "@/lib/services/trends";

/**
 * GET /api/trends?period=30d
 *
 * Returns market-wide analytics:
 * - Market snapshots over time (for charts)
 * - Current breakdown by type
 * - Top movers (gainers/losers)
 * - Store status summary
 */
const VALID_PERIODS: TrendsPeriod[] = ["7d", "30d", "90d", "all"];

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("period") || "30d";
  const period: TrendsPeriod = (VALID_PERIODS as string[]).includes(raw)
    ? (raw as TrendsPeriod)
    : "30d";

  const data = await cached(`trends:${period}`, CACHE_TTL.ITEMS_LIST, () =>
    getTrendsData(period),
  );

  return NextResponse.json(data);
}
