import { NextRequest, NextResponse } from "next/server";
import { generateDrafts, generateTweet, type TweetKind } from "@/lib/twitter/content";
import { postTweet } from "@/lib/twitter/client";
import { prisma } from "@/lib/db";

/** Extract the first /items/<slug> URL from a tweet body, if any. */
function extractItemSlug(text: string): string | null {
  const match = text.match(/sboxskins\.gg\/items\/([a-z0-9-]+)/);
  return match ? match[1] : null;
}

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
  // Prefer Authorization header (doesn't leak into URLs/logs). Keep URL
  // query as a transitional fallback while UIs are migrated.
  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${adminKey}`) return true;
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
  // Accept either CRON_SECRET (for automated/cron posts) or ANALYTICS_KEY
  // (for manual posts from the admin UI — that's what users type in)
  const cronSecret = process.env.CRON_SECRET;
  const adminKey = process.env.ANALYTICS_KEY;
  const authHeader = request.headers.get("authorization");
  const validAuth =
    (cronSecret && authHeader === `Bearer ${cronSecret}`) ||
    (adminKey && authHeader === `Bearer ${adminKey}`);
  if (!validAuth) {
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

  // Log successful tweets so we can show performance later
  if (result.success && result.tweetId) {
    try {
      await prisma.sentTweet.create({
        data: {
          tweetId: result.tweetId,
          text: body.text,
          kind: "custom",
          itemSlug: extractItemSlug(body.text),
        },
      });
    } catch (err) {
      console.error("[tweet-log] Failed to log sent tweet:", err);
    }
  }

  const status = result.success ? 200 : 500;
  return NextResponse.json(result, { status });
}
