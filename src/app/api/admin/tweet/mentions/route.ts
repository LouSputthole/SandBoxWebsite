import { NextRequest, NextResponse } from "next/server";
import { searchSboxMentions } from "@/lib/twitter/client";
import { draftReply } from "@/lib/twitter/reply";

/**
 * GET /api/admin/tweet/mentions?key=<ANALYTICS_KEY>
 *
 * Returns recent S&box-related tweets with 3 draft reply variations each.
 * Gated by ANALYTICS_KEY (same as the analytics dashboard).
 */
export async function GET(request: NextRequest) {
  const adminKey = process.env.ANALYTICS_KEY;
  if (!adminKey || request.nextUrl.searchParams.get("key") !== adminKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const max = parseInt(request.nextUrl.searchParams.get("max") ?? "15", 10);
  const tweets = await searchSboxMentions(Math.min(50, Math.max(5, max)));

  if (tweets.length === 0) {
    return NextResponse.json({
      mentions: [],
      note: "No recent S&box-related tweets found (or Twitter credentials not configured).",
    });
  }

  const drafts = await Promise.all(tweets.map((t) => draftReply(t)));
  return NextResponse.json({ mentions: drafts });
}
