import { NextRequest, NextResponse } from "next/server";
import { generateDrafts, generateTweet, type TweetKind } from "@/lib/twitter/content";
import { postTweet } from "@/lib/twitter/client";
import { prisma } from "@/lib/db";
import { guardAdminRoute } from "@/lib/auth/admin-guard";

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
 * Both endpoints go through guardAdminRoute, which adds per-IP brute-force
 * rate limiting to the bearer check. GET accepts only ANALYTICS_KEY; POST
 * accepts ANALYTICS_KEY or CRON_SECRET (so automated cron posts + manual
 * posts from the /admin/tweet UI both work).
 */

/**
 * Report the freshest moment any item in the catalog was touched by a sync
 * — used by the admin UI to show "data X ago" so the user knows whether
 * these drafts are based on stale numbers. `updatedAt` bumps on every
 * Prisma update, so this reflects both Steam price syncs and sbox.dev
 * enrichment.
 */
async function getDataFreshness(): Promise<string | null> {
  const latest = await prisma.item.findFirst({
    orderBy: { updatedAt: "desc" },
    select: { updatedAt: true },
  });
  return latest?.updatedAt.toISOString() ?? null;
}

/**
 * Report the freshest moment any item in the catalog was touched by a sync
 * — used by the admin UI to show "data X ago" so the user knows whether
 * these drafts are based on stale numbers. `updatedAt` bumps on every
 * Prisma update, so this reflects both Steam price syncs and sbox.dev
 * enrichment.
 */
async function getDataFreshness(): Promise<string | null> {
  const latest = await prisma.item.findFirst({
    orderBy: { updatedAt: "desc" },
    select: { updatedAt: true },
  });
  return latest?.updatedAt.toISOString() ?? null;
}

export async function GET(request: NextRequest) {
  const guard = await guardAdminRoute(request, { allowedKeys: ["analytics"] });
  if (!guard.ok) return guard.response;

  const kind = request.nextUrl.searchParams.get("kind") as TweetKind | null;
  const dataUpdatedAt = await getDataFreshness();

  if (kind) {
    const draft = await generateTweet(kind);
    if (!draft) {
      return NextResponse.json(
        { error: `No data available for tweet type "${kind}"` },
        { status: 404 },
      );
    }
    return NextResponse.json({ drafts: [draft], dataUpdatedAt });
  }

  const drafts = await generateDrafts();
  return NextResponse.json({ drafts, dataUpdatedAt });
}

export async function POST(request: NextRequest) {
  const guard = await guardAdminRoute(request);
  if (!guard.ok) return guard.response;

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
