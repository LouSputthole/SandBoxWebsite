import { NextRequest, NextResponse } from "next/server";
import { guardAdminRoute } from "@/lib/auth/admin-guard";

/**
 * GET /api/admin/tweet/mentions?key=<ANALYTICS_KEY>
 *
 * DISABLED — tweet reading is turned off to conserve X API credits.
 *
 * This used to call X's `tweets/search/recent` endpoint (twice per request,
 * plus a diagnostic probe) to surface S&box mentions + tracked-account posts
 * for reply drafting. Searching/reading needs a paid X API tier and wasn't
 * returning useful results, so every call just burned read quota. We now
 * short-circuit with ZERO X API calls. Posting/scheduling tweets is unaffected.
 *
 * To re-enable: restore the search helpers in src/lib/twitter/client.ts
 * (`searchSboxMentions` / `searchAccountTweets`) and wire them back here.
 */
export async function GET(request: NextRequest) {
  const guard = await guardAdminRoute(request, { allowedKeys: ["analytics"] });
  if (!guard.ok) return guard.response;

  return NextResponse.json({
    mentions: [],
    disabled: true,
    note: "Tweet reading is disabled to conserve X API credits. Posting and scheduling still work.",
  });
}
