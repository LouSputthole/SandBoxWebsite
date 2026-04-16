import { NextRequest, NextResponse } from "next/server";
import { searchSboxMentions } from "@/lib/twitter/client";
import { draftReply } from "@/lib/twitter/reply";
import { guardAdminRoute } from "@/lib/auth/admin-guard";

/**
 * GET /api/admin/tweet/mentions?key=<ANALYTICS_KEY>
 *
 * Returns recent S&box-related tweets with 3 draft reply variations each.
 * Gated by ANALYTICS_KEY with per-IP brute-force rate limiting.
 */
export async function GET(request: NextRequest) {
  const guard = await guardAdminRoute(request, { allowedKeys: ["analytics"] });
  if (!guard.ok) return guard.response;

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
