import { NextRequest, NextResponse } from "next/server";
import {
  searchSboxMentions,
  searchAccountTweets,
  TRACKED_ACCOUNTS,
} from "@/lib/twitter/client";
import { draftReply } from "@/lib/twitter/reply";
import { guardAdminRoute } from "@/lib/auth/admin-guard";

/**
 * GET /api/admin/tweet/mentions?key=<ANALYTICS_KEY>
 *
 * Returns recent tweets to reply to, each with draft reply variations:
 *   1. Posts from TRACKED_ACCOUNTS (@s8box, @garrynewman, @sboxverse) —
 *      surfaced first, tagged "📌 Tracked", so we can ride their reach.
 *   2. Keyword mentions of S&box / our handle.
 * Deduped by tweet id. Gated by ANALYTICS_KEY with brute-force rate limiting.
 */
export async function GET(request: NextRequest) {
  const guard = await guardAdminRoute(request, { allowedKeys: ["analytics"] });
  if (!guard.ok) return guard.response;

  const max = parseInt(request.nextUrl.searchParams.get("max") ?? "15", 10);
  const clamped = Math.min(50, Math.max(5, max));

  // Pull both sources in parallel: posts from the tracked accounts + the
  // keyword-mention search. Tracked posts come first (priority); dedupe by id
  // so an account that ALSO matched a keyword isn't listed twice.
  const [accountTweets, mentionTweets] = await Promise.all([
    searchAccountTweets(),
    searchSboxMentions(clamped),
  ]);

  const seen = new Set<string>();
  const merged = [...accountTweets, ...mentionTweets].filter((t) => {
    if (seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });

  if (merged.length === 0) {
    return NextResponse.json({
      mentions: [],
      note: "No recent tracked-account or S&box-related tweets found (or Twitter credentials not configured).",
    });
  }

  const trackedSet = new Set(TRACKED_ACCOUNTS.map((h) => h.toLowerCase()));
  const drafts = await Promise.all(
    merged.map(async (t) => {
      const draft = await draftReply(t);
      // Flag tracked-account posts so the admin UI can tell them apart from
      // ordinary keyword mentions (the reason pill renders this verbatim).
      if (trackedSet.has(t.authorUsername.toLowerCase())) {
        draft.reason = `📌 Tracked @${t.authorUsername}${
          draft.matchedItemName ? ` — mentions ${draft.matchedItemName}` : ""
        }`;
      }
      return draft;
    }),
  );
  return NextResponse.json({ mentions: drafts });
}
