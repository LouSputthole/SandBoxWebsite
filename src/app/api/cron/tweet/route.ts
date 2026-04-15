import { NextRequest, NextResponse } from "next/server";
import { pickScheduledTweet } from "@/lib/twitter/content";
import { postTweet } from "@/lib/twitter/client";

/**
 * GET /api/cron/tweet — Scheduled tweet poster (Vercel Cron entry point).
 *
 * Vercel calls this with `Authorization: Bearer ${CRON_SECRET}` header when
 * configured via vercel.json. Picks a rotating tweet kind based on day-of-year
 * so we don't post the same shape every day.
 *
 * Safe to call manually for testing — just include the bearer token.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const draft = await pickScheduledTweet();
  if (!draft) {
    return NextResponse.json(
      { error: "No tweet data available (no items in DB with enough signals)" },
      { status: 503 },
    );
  }

  if (draft.approxLength > 280) {
    // Fall back gracefully — don't post an over-length tweet
    return NextResponse.json(
      { error: `Generated tweet too long (${draft.approxLength}), skipping`, draft },
      { status: 400 },
    );
  }

  console.log(`[cron:tweet] Posting ${draft.kind}: ${draft.text.slice(0, 80)}...`);
  const result = await postTweet(draft.text);

  if (result.success) {
    console.log(`[cron:tweet] Posted! ${result.tweetUrl}`);
  } else {
    console.error(`[cron:tweet] Failed: ${result.error}`);
  }

  return NextResponse.json({
    kind: draft.kind,
    text: draft.text,
    ...result,
  });
}
