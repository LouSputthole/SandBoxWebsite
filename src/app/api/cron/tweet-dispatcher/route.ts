import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { postTweet, postReply } from "@/lib/twitter/client";

/**
 * GET /api/cron/tweet-dispatcher — Scheduled tweet dispatcher.
 *
 * Runs every 5 minutes via Vercel Cron. Picks up any ScheduledTweet rows
 * whose status is "pending" and scheduledFor <= now, posts them, and
 * records the result. Each successful post also creates a SentTweet row
 * so it shows up in the analytics dashboard.
 *
 * If a post fails, the row is marked "failed" with the error reason —
 * we don't keep retrying to avoid spamming if Twitter is having a bad day.
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

  const now = new Date();
  const due = await prisma.scheduledTweet.findMany({
    where: { status: "pending", scheduledFor: { lte: now } },
    orderBy: { scheduledFor: "asc" },
    take: 20, // safety cap — no point posting 100 tweets in one shot
  });

  if (due.length === 0) {
    return NextResponse.json({ checked: 0, posted: 0, failed: 0 });
  }

  let posted = 0;
  let failed = 0;
  const results: { id: string; status: string; tweetId?: string; error?: string }[] = [];

  for (const t of due) {
    // Atomically claim the row before calling Twitter. If the claim fails
    // (count=0), another dispatch beat us to it — skip. Writing attemptedAt
    // up front also means a mid-flight crash won't leave the row "pending"
    // and cause a double-post on the next dispatch. Twitter has no
    // idempotency key, so that matters.
    const claim = await prisma.scheduledTweet.updateMany({
      where: { id: t.id, status: "pending" },
      data: { attemptedAt: now },
    });
    if (claim.count === 0) continue;

    // Each iteration is fully isolated — one throwing tweet can't take out
    // the rest of the batch.
    try {
      const result = t.inReplyToTweetId
        ? await postReply(t.text, t.inReplyToTweetId)
        : await postTweet(t.text);

      if (result.success && result.tweetId) {
        // Mark scheduled row as posted, link to the new SentTweet, both in one
        // transaction so analytics stay consistent
        await prisma.$transaction([
          prisma.scheduledTweet.update({
            where: { id: t.id },
            data: {
              status: "posted",
              postedTweetId: result.tweetId,
              attemptedAt: now,
            },
          }),
          prisma.sentTweet.create({
            data: {
              tweetId: result.tweetId,
              text: t.text,
              kind: t.kind ?? "scheduled",
              itemSlug: t.itemSlug,
              inReplyToTweetId: t.inReplyToTweetId,
            },
          }),
        ]);
        posted++;
        results.push({ id: t.id, status: "posted", tweetId: result.tweetId });
      } else {
        await prisma.scheduledTweet.update({
          where: { id: t.id },
          data: {
            status: "failed",
            failureReason: result.error ?? "unknown error",
            attemptedAt: now,
          },
        });
        failed++;
        results.push({ id: t.id, status: "failed", error: result.error });
      }
    } catch (err) {
      // Hard failure (network, Twitter 5xx, DB error, …). Mark failed so we
      // don't spin-retry the same row next dispatch.
      const reason = err instanceof Error ? err.message : String(err);
      await prisma.scheduledTweet
        .update({
          where: { id: t.id },
          data: { status: "failed", failureReason: reason, attemptedAt: now },
        })
        .catch(() => {});
      failed++;
      results.push({ id: t.id, status: "failed", error: reason });
    }
  }

  console.log(`[cron:tweet-dispatcher] Checked ${due.length}, posted ${posted}, failed ${failed}`);

  return NextResponse.json({
    checked: due.length,
    posted,
    failed,
    results,
  });
}
