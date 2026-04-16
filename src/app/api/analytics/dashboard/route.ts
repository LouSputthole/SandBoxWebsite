import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guardAdminRoute } from "@/lib/auth/admin-guard";

/**
 * GET /api/analytics/dashboard?period=7d
 *
 * Returns analytics data: views, visitors, top pages, referrers, devices, etc.
 * Protected by ANALYTICS_KEY with per-IP brute-force rate limiting.
 */
export async function GET(request: NextRequest) {
  const guard = await guardAdminRoute(request, { allowedKeys: ["analytics"] });
  if (!guard.ok) return guard.response;

  const period = request.nextUrl.searchParams.get("period") ?? "7d";
  const days = period === "30d" ? 30 : period === "24h" ? 1 : 7;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // Run all aggregations in parallel at the database layer instead of pulling
  // the whole table into Node memory and grouping in JS. Significantly faster
  // and uses constant memory regardless of pageview volume.
  const [
    totalViews,
    visitorsRaw,
    topPagesRaw,
    topReferrersRaw,
    topCountriesRaw,
    devicesRaw,
    browsersRaw,
    osRaw,
    dailyRaw,
  ] = await Promise.all([
    prisma.pageView.count({ where: { timestamp: { gte: since } } }),

    // COUNT(DISTINCT sessionId) — Prisma's typed query layer doesn't expose
    // distinct counts cleanly, so use raw.
    prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(DISTINCT "sessionId")::bigint AS count
      FROM "PageView"
      WHERE "timestamp" >= ${since} AND "sessionId" IS NOT NULL
    `,

    prisma.pageView.groupBy({
      by: ["path"],
      where: { timestamp: { gte: since } },
      _count: { _all: true },
      orderBy: { _count: { path: "desc" } },
      take: 20,
    }),

    prisma.pageView.groupBy({
      by: ["referrer"],
      where: { timestamp: { gte: since }, referrer: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { referrer: "desc" } },
      take: 20,
    }),

    prisma.pageView.groupBy({
      by: ["country"],
      where: { timestamp: { gte: since }, country: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { country: "desc" } },
      take: 20,
    }),

    prisma.pageView.groupBy({
      by: ["device"],
      where: { timestamp: { gte: since }, device: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { device: "desc" } },
    }),

    prisma.pageView.groupBy({
      by: ["browser"],
      where: { timestamp: { gte: since }, browser: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { browser: "desc" } },
    }),

    prisma.pageView.groupBy({
      by: ["os"],
      where: { timestamp: { gte: since }, os: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { os: "desc" } },
    }),

    // Daily views + unique visitors via DATE_TRUNC. One query, server-side.
    prisma.$queryRaw<{ date: Date; views: bigint; visitors: bigint }[]>`
      SELECT
        DATE_TRUNC('day', "timestamp")::date AS date,
        COUNT(*)::bigint AS views,
        COUNT(DISTINCT "sessionId")::bigint AS visitors
      FROM "PageView"
      WHERE "timestamp" >= ${since}
      GROUP BY 1
      ORDER BY 1 ASC
    `,
  ]);

  const uniqueVisitors = Number(visitorsRaw[0]?.count ?? 0);

  const topPages = topPagesRaw.map((r) => ({
    path: r.path,
    count: r._count._all,
  }));
  const topReferrers = topReferrersRaw
    .filter((r) => r.referrer != null)
    .map((r) => ({ referrer: r.referrer as string, count: r._count._all }));
  const topCountries = topCountriesRaw
    .filter((r) => r.country != null)
    .map((r) => ({ country: r.country as string, count: r._count._all }));
  const devices = devicesRaw
    .filter((r) => r.device != null)
    .map((r) => ({ device: r.device as string, count: r._count._all }));
  const browsers = browsersRaw
    .filter((r) => r.browser != null)
    .map((r) => ({ browser: r.browser as string, count: r._count._all }));
  const operatingSystems = osRaw
    .filter((r) => r.os != null)
    .map((r) => ({ os: r.os as string, count: r._count._all }));

  const viewsByDay = dailyRaw.map((r) => ({
    date:
      r.date instanceof Date
        ? r.date.toISOString().slice(0, 10)
        : String(r.date),
    views: Number(r.views),
    visitors: Number(r.visitors),
  }));

  return NextResponse.json({
    period,
    totalViews,
    uniqueVisitors,
    topPages,
    topReferrers,
    topCountries,
    devices,
    browsers,
    operatingSystems,
    viewsByDay,
  });
}
