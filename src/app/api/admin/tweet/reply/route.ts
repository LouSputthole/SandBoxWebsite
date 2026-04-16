import { NextRequest, NextResponse } from "next/server";
import { postReply } from "@/lib/twitter/client";
import { prisma } from "@/lib/db";
import { guardAdminRoute } from "@/lib/auth/admin-guard";

function extractItemSlug(text: string): string | null {
  const match = text.match(/sboxskins\.gg\/items\/([a-z0-9-]+)/);
  return match ? match[1] : null;
}

/**
 * POST /api/admin/tweet/reply
 * Body: { text: string, inReplyToTweetId: string }
 *
 * Posts a reply to a specific tweet. Accepts either CRON_SECRET or
 * ANALYTICS_KEY (admin UI uses the latter). Guarded by per-IP brute-
 * force rate limiting.
 */
export async function POST(request: NextRequest) {
  const guard = await guardAdminRoute(request);
  if (!guard.ok) return guard.response;

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
