import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendNewsletterIssue } from "@/lib/newsletter/send";

export const maxDuration = 300;

/**
 * Fan out the latest published newsletter issue to its subscriber list.
 *
 * Triggered by:
 *  - Vercel cron (Friday 18:15 UTC + Monday 14:15 UTC, 15 minutes after
 *    each blog-publish cron so the post is guaranteed to exist)
 *  - Manual invocation with CRON_SECRET + `?kind=monday-outlook|friday-report`
 *
 * `kind` query param picks which newsletter to send. Defaults to the
 * most recent published BlogPost across both kinds if omitted — useful
 * for one-off backfills.
 *
 * Idempotent: `sendNewsletterIssue()` dedupes via
 * `NewsletterSubscription.lastSentAt` so re-running after a partial
 * failure only picks up who we missed.
 */
async function handle(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const kindParam = request.nextUrl.searchParams.get("kind");
  const KNOWN_KINDS: Record<string, string> = {
    "monday-outlook": "Monday outlook",
    "friday-report": "Friday wrap",
    // `weekly-report` is the historical blog-post kind; we accept it as
    // an alias for the same subscriber list so old cron wiring keeps
    // working.
    "weekly-report": "Friday wrap",
  };

  // Map blog-post kind → subscription-kind bucket. Subscribers signed up
  // for "friday-report"; legacy posts are saved with kind "weekly-report".
  // We send to the subscriber bucket, read from the blog-post kind.
  function subscriberKindFor(postKind: string): string {
    if (postKind === "weekly-report" || postKind === "friday-report") {
      return "friday-report";
    }
    return postKind;
  }

  try {
    const postKindFilter = kindParam
      ? kindParam === "weekly-report"
        ? ["weekly-report", "friday-report"]
        : [kindParam]
      : ["monday-outlook", "friday-report", "weekly-report"];

    const post = await prisma.blogPost.findFirst({
      where: { kind: { in: postKindFilter } },
      orderBy: { publishedAt: "desc" },
      select: {
        slug: true,
        title: true,
        excerpt: true,
        content: true,
        publishedAt: true,
        kind: true,
      },
    });
    if (!post || !post.kind) {
      return NextResponse.json(
        { error: "No published post to send for that kind" },
        { status: 404 },
      );
    }

    const subKind = subscriberKindFor(post.kind);
    const label = KNOWN_KINDS[subKind] ?? KNOWN_KINDS[post.kind] ?? post.kind;

    const result = await sendNewsletterIssue({
      kind: subKind,
      kindLabel: label,
      post: {
        slug: post.slug,
        title: post.title,
        excerpt: post.excerpt,
        content: post.content,
        publishedAt: post.publishedAt,
      },
    });

    return NextResponse.json({
      postSlug: post.slug,
      kind: subKind,
      ...result,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export const GET = handle;
export const POST = handle;
