import { NextRequest, NextResponse } from "next/server";
import { postReply } from "@/lib/twitter/client";
import { prisma } from "@/lib/db";

function extractItemSlug(text: string): string | null {
  const match = text.match(/sboxskins\.gg\/items\/([a-z0-9-]+)/);
  return match ? match[1] : null;
}

/**
 * POST /api/admin/tweet/reply
 * Body: { text: string, inReplyToTweetId: string }
 * Auth: Bearer ${CRON_SECRET}
 *
 * Posts a reply to a specific tweet. Separated from the main tweet POST so
 * the UI can differentiate reply vs standalone tweet actions.
 */
export async function POST(request: NextRequest) {
  // Accept either CRON_SECRET or ANALYTICS_KEY (for the admin UI)
  const cronSecret = process.env.CRON_SECRET;
  const adminKey = process.env.ANALYTICS_KEY;
  const authHeader = request.headers.get("authorization");
  const validAuth =
    (cronSecret && authHeader === `Bearer ${cronSecret}`) ||
    (adminKey && authHeader === `Bearer ${adminKey}`);
  if (!validAuth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { text?: string; inReplyToTweetId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.text || typeof body.text !== "string") {
    return NextResponse.json({ error: "Missing 'text' field" }, { status: 400 });
  }
  if (!body.inReplyToTweetId || typeof body.inReplyToTweetId !== "string") {
    return NextResponse.json(
      { error: "Missing 'inReplyToTweetId' field" },
      { status: 400 },
    );
  }
  if (body.text.length > 280) {
    return NextResponse.json(
      { error: `Reply is ${body.text.length} chars — max is 280` },
      { status: 400 },
    );
  }

  const result = await postReply(body.text, body.inReplyToTweetId);

  if (result.success && result.tweetId) {
    try {
      await prisma.sentTweet.create({
        data: {
          tweetId: result.tweetId,
          text: body.text,
          kind: "reply",
          itemSlug: extractItemSlug(body.text),
          inReplyToTweetId: body.inReplyToTweetId,
        },
      });
    } catch (err) {
      console.error("[tweet-log] Failed to log reply:", err);
    }
  }

  const status = result.success ? 200 : 500;
  return NextResponse.json(result, { status });
}
