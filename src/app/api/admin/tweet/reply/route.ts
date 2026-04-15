import { NextRequest, NextResponse } from "next/server";
import { postReply } from "@/lib/twitter/client";

/**
 * POST /api/admin/tweet/reply
 * Body: { text: string, inReplyToTweetId: string }
 * Auth: Bearer ${CRON_SECRET}
 *
 * Posts a reply to a specific tweet. Separated from the main tweet POST so
 * the UI can differentiate reply vs standalone tweet actions.
 */
export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
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
  const status = result.success ? 200 : 500;
  return NextResponse.json(result, { status });
}
