import { NextResponse } from "next/server";
import { getFxRates } from "@/lib/fx/rates";

/**
 * GET /api/fx — Returns USD-based FX rates for every supported
 * currency. Cached at the edge for an hour; the underlying data only
 * updates daily on the ECB's schedule so browsers can cache hard.
 */
export async function GET() {
  const data = await getFxRates();
  return NextResponse.json(data, {
    headers: {
      // 1h browser cache, 24h CDN cache, stale-while-revalidate 24h.
      // FX moves slow enough that a tab loading stale rates is fine.
      "Cache-Control":
        "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400",
    },
  });
}

// Don't auto-revalidate via ISR — the Redis layer handles freshness.
export const revalidate = 3600;
