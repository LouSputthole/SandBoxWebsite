import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * GET /api/analytics/dashboard?period=7d
 *
 * Returns analytics data: views, visitors, top pages, referrers, devices, etc.
 * Protected by ADMIN_KEY query param (set in env as ANALYTICS_KEY).
 */
export async function GET(request: NextRequest) {
  const analyticsKey = process.env.ANALYTICS_KEY;
  if (!analyticsKey) {
    return NextResponse.json({ error: "Admin key not configured" }, { status: 500 });
  }
  // Prefer Authorization header so the key doesn't appear in URLs/access logs.
  const authHeader = request.headers.get("authorization");
  const queryKey = request.nextUrl.searchParams.get("key");
  const authorized =
    authHeader === `Bearer ${analyticsKey}` || queryKey === analyticsKey;
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const period = request.nextUrl.searchParams.get("period") ?? "7d";
  const days = period === "30d" ? 30 : period === "24h" ? 1 : 7;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const views = await prisma.pageView.findMany({
    where: { timestamp: { gte: since } },
    select: {
      path: true,
      referrer: true,
      country: true,
      device: true,
      browser: true,
      os: true,
      sessionId: true,
      timestamp: true,
    },
    orderBy: { timestamp: "desc" },
  });

  const totalViews = views.length;
  const uniqueVisitors = new Set(views.map((v) => v.sessionId).filter(Boolean))
    .size;

  // Top pages
  const pageCounts = new Map<string, number>();
  for (const v of views) {
    pageCounts.set(v.path, (pageCounts.get(v.path) ?? 0) + 1);
  }
  const topPages = [...pageCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([path, count]) => ({ path, count }));

  // Top referrers
  const refCounts = new Map<string, number>();
  for (const v of views) {
    if (v.referrer) {
      refCounts.set(v.referrer, (refCounts.get(v.referrer) ?? 0) + 1);
    }
  }
  const topReferrers = [...refCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([referrer, count]) => ({ referrer, count }));

  // Countries
  const countryCounts = new Map<string, number>();
  for (const v of views) {
    if (v.country) {
      countryCounts.set(v.country, (countryCounts.get(v.country) ?? 0) + 1);
    }
  }
  const topCountries = [...countryCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([country, count]) => ({ country, count }));

  // Devices
  const deviceCounts = new Map<string, number>();
  for (const v of views) {
    if (v.device) {
      deviceCounts.set(v.device, (deviceCounts.get(v.device) ?? 0) + 1);
    }
  }
  const devices = [...deviceCounts.entries()].map(([device, count]) => ({
    device,
    count,
  }));

  // Browsers
  const browserCounts = new Map<string, number>();
  for (const v of views) {
    if (v.browser) {
      browserCounts.set(v.browser, (browserCounts.get(v.browser) ?? 0) + 1);
    }
  }
  const browsers = [...browserCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([browser, count]) => ({ browser, count }));

  // OS
  const osCounts = new Map<string, number>();
  for (const v of views) {
    if (v.os) {
      osCounts.set(v.os, (osCounts.get(v.os) ?? 0) + 1);
    }
  }
  const operatingSystems = [...osCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([os, count]) => ({ os, count }));

  // Views by day
  const dailyCounts = new Map<string, { views: number; visitors: Set<string> }>();
  for (const v of views) {
    const day = v.timestamp.toISOString().slice(0, 10);
    if (!dailyCounts.has(day)) {
      dailyCounts.set(day, { views: 0, visitors: new Set() });
    }
    const entry = dailyCounts.get(day)!;
    entry.views++;
    if (v.sessionId) entry.visitors.add(v.sessionId);
  }
  const viewsByDay = [...dailyCounts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, data]) => ({
      date,
      views: data.views,
      visitors: data.visitors.size,
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
