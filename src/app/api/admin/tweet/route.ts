import { NextRequest, NextResponse } from "next/server";
import { generateDrafts, generateTweet, type TweetKind } from "@/lib/twitter/content";
import { postTweet } from "@/lib/twitter/client";

/**
 * GET  /api/admin/tweet?key=<ANALYTICS_KEY>            — returns draft variations
 * GET  /api/admin/tweet?key=...&kind=top-gainer        — returns one specific draft
 * POST /api/admin/tweet                                 — posts a tweet (auth header + body { text })
 *
 * The GET side is gated by the same ANALYTICS_KEY used for the analytics
 * dashboard so it can be used from the /admin/tweet page without a real auth
 * system. POST requires the stricter CRON_SECRET bearer token to prevent
 * drive-by tweet posting.
 */

function checkAdminKey(request: NextRequest): boolean {
  const adminKey = process.env.ANALYTICS_KEY;
  if (!adminKey) return false;
  return request.nextUrl.searchParams.get("key") === adminKey;
}

export async function GET(request: NextRequest) {
  if (!checkAdminKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const kind = request.nextUrl.searchParams.get("kind") as TweetKind | null;

  if (kind) {
    const draft = await generateTweet(kind);
    if (!draft) {
      return NextResponse.json(
        { error: `No data available for tweet type "${kind}"` },
        { status: 404 },
      );
    }
    return NextResponse.json({ drafts: [draft] });
  }

  const drafts = await generateDrafts();
  return NextResponse.json({ drafts });
}

export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { text?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.text || typeof body.text !== "string") {
    return NextResponse.json({ error: "Missing 'text' field" }, { status: 400 });
  }

  if (body.text.length > 280) {
    return NextResponse.json(
      { error: `Tweet is ${body.text.length} chars — max is 280` },
      { status: 400 },
    );
  }

  const result = await postTweet(body.text);
  const status = result.success ? 200 : 500;
  return NextResponse.json(result, { status });
}
