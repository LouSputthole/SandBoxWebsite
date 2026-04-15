import { NextRequest, NextResponse } from "next/server";
import { pickWeeklyTweet } from "@/lib/twitter/content";
import { postTweet } from "@/lib/twitter/client";
import { prisma } from "@/lib/db";

/**
 * GET /api/cron/tweet-weekly — Weekly tweet poster, scheduled Fridays.
 *
 * Picks a weekly-flavored tweet (recap, 7d gainer, 7d market change, 7d loser)
 * and posts it. Separate from the daily cron so both can fire on Fridays
 * without conflict — gives a nice double-dose of content to end the week.
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

  const draft = await pickWeeklyTweet();
  if (!draft) {
    return NextResponse.json(
      { error: "No weekly tweet data available (not enough price history yet)" },
      { status: 503 },
    );
  }

  if (draft.approxLength > 280) {
    return NextResponse.json(
      { error: `Weekly tweet too long (${draft.approxLength}), skipping`, draft },
      { status: 400 },
    );
  }

  console.log(`[cron:tweet-weekly] Posting ${draft.kind}: ${draft.text.slice(0, 80)}...`);
  const result = await postTweet(draft.text);

  if (result.success) {
    console.log(`[cron:tweet-weekly] Posted! ${result.tweetUrl}`);
    if (result.tweetId) {
      try {
        await prisma.sentTweet.create({
          data: {
            tweetId: result.tweetId,
            text: draft.text,
            kind: draft.kind,
            itemSlug: draft.itemSlug ?? null,
          },
        });
      } catch (err) {
        console.error("[cron:tweet-weekly] Failed to log:", err);
      }
    }
  } else {
    console.error(`[cron:tweet-weekly] Failed: ${result.error}`);
  }

  return NextResponse.json({
    kind: draft.kind,
    text: draft.text,
    ...result,
  });
}
