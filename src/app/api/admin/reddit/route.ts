import { NextRequest, NextResponse } from "next/server";
import { guardAdminRoute } from "@/lib/auth/admin-guard";
import { generateRedditDrafts } from "@/lib/reddit/content";

/**
 * GET /api/admin/reddit
 *
 * Returns 3–5 Reddit post drafts, each with a title, markdown body,
 * subreddit recommendations with risk tags, and an image URL (we
 * reuse the /s/<slug>/opengraph-image endpoint as the cover art).
 *
 * Protected via guardAdminRoute — ANALYTICS_KEY or CRON_SECRET work.
 * Rate-limited per IP by the guard so an unattended admin tab can't
 * accidentally stampede the DB.
 */
export async function GET(request: NextRequest) {
  const guard = await guardAdminRoute(request, {
    allowedKeys: ["analytics", "cron"],
  });
  if (!guard.ok) return guard.response;

  try {
    const drafts = await generateRedditDrafts();
    return NextResponse.json({ drafts });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
