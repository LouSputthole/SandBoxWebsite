import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guardAdminRoute } from "@/lib/auth/admin-guard";
import { sendNewsletterIssue } from "@/lib/newsletter/send";

export const maxDuration = 300;

/**
 * Admin-triggered newsletter fan-out. Same thing the cron does at
 * `/api/cron/newsletter-send`, but gated by ANALYTICS_KEY so the admin
 * UI can push a send without needing CRON_SECRET in the browser.
 *
 * Query: ?kind=monday-outlook | friday-report
 * Picks the latest published BlogPost of matching kind, fans out to
 * verified+subscribed recipients, dedupes via lastSentAt.
 */
const LABEL: Record<string, string> = {
  "monday-outlook": "Monday outlook",
  "friday-report": "Friday wrap",
};

export async function POST(request: NextRequest) {
  const guard = await guardAdminRoute(request, { allowedKeys: ["analytics"] });
  if (!guard.ok) return guard.response;

  const kind = request.nextUrl.searchParams.get("kind") ?? "";
  if (!LABEL[kind]) {
    return NextResponse.json(
      { error: `Unknown kind '${kind}'` },
      { status: 400 },
    );
  }

  // "friday-report" subscribers receive posts of kind "friday-report"
  // OR the legacy "weekly-report" alias.
  const postKinds =
    kind === "friday-report" ? ["friday-report", "weekly-report"] : [kind];

  const post = await prisma.blogPost.findFirst({
    where: { kind: { in: postKinds } },
    orderBy: { publishedAt: "desc" },
    select: {
      slug: true,
      title: true,
      excerpt: true,
      content: true,
      publishedAt: true,
    },
  });
  if (!post) {
    return NextResponse.json(
      { error: "No published post for that kind" },
      { status: 404 },
    );
  }

  try {
    const result = await sendNewsletterIssue({
      kind,
      kindLabel: LABEL[kind],
      post,
    });
    return NextResponse.json({ postSlug: post.slug, kind, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
