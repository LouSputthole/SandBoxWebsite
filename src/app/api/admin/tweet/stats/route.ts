import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * GET /api/admin/tweet/stats?key=<ANALYTICS_KEY>&period=7d
 *
 * Returns sent tweets in the window + click attribution.
 * Click attribution = pageviews with referrer containing "t.co" to a matching
 * path, within the period.
 */
export async function GET(request: NextRequest) {
  const adminKey = process.env.ANALYTICS_KEY;
  if (!adminKey || request.nextUrl.searchParams.get("key") !== adminKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const period = request.nextUrl.searchParams.get("period") ?? "7d";
  const days = period === "30d" ? 30 : period === "24h" ? 1 : 7;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // All sent tweets in window
  const tweets = await prisma.sentTweet.findMany({
    where: { sentAt: { gte: since } },
    orderBy: { sentAt: "desc" },
  });

  // All t.co-referred pageviews in window
  const clicks = await prisma.pageView.findMany({
    where: {
      timestamp: { gte: since },
      referrer: { contains: "t.co" },
    },
    select: { path: true, timestamp: true },
  });

  // Totals by path
  const clicksByPath: Record<string, number> = {};
  for (const c of clicks) {
    clicksByPath[c.path] = (clicksByPath[c.path] ?? 0) + 1;
  }

  // Per-tweet click attribution:
  // Match clicks to the tweet's itemSlug (if any) that occurred AFTER sentAt.
  // This is heuristic — if multiple tweets point to the same item in the window,
  // credit is split proportionally.
  const tweetStats = tweets.map((t) => {
    const tweetPath = t.itemSlug ? `/items/${t.itemSlug}` : "/";
    // Clicks on this path after this tweet was sent
    const clicksAfter = clicks.filter(
      (c) => c.path === tweetPath && new Date(c.timestamp) >= t.sentAt,
    ).length;
    return {
      ...t,
      sentAt: t.sentAt.toISOString(),
      estimatedClicks: clicksAfter,
      targetPath: tweetPath,
    };
  });

  // Breakdown by tweet kind (type counts)
  const kindCounts: Record<string, number> = {};
  for (const t of tweets) {
    const k = t.kind ?? "unknown";
    kindCounts[k] = (kindCounts[k] ?? 0) + 1;
  }

  const totalTcoClicks = clicks.length;
  const uniquePaths = Object.keys(clicksByPath).length;

  return NextResponse.json({
    period,
    totalTweets: tweets.length,
    totalTcoClicks,
    uniquePathsReferred: uniquePaths,
    kindCounts,
    clicksByPath: Object.entries(clicksByPath)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([path, count]) => ({ path, count })),
    tweets: tweetStats,
  });
}
