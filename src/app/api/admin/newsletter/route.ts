import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guardAdminRoute } from "@/lib/auth/admin-guard";
import { sendVerificationEmail } from "@/lib/newsletter/send";

/**
 * GET  /api/admin/newsletter — subscriber list + per-kind counts.
 * POST /api/admin/newsletter — admin actions:
 *   { action: "verify", id }       mark verified (skip email confirm)
 *   { action: "unsubscribe", id }  soft-delete (stamps unsubscribedAt)
 *   { action: "resend-verify", id } re-fire the verification email
 *   { action: "test-send", id, kind, postSlug } send a specific issue to one sub
 *
 * Gated by ANALYTICS_KEY via guardAdminRoute.
 */
export async function GET(request: NextRequest) {
  const guard = await guardAdminRoute(request, { allowedKeys: ["analytics"] });
  if (!guard.ok) return guard.response;

  const [subs, totals] = await Promise.all([
    prisma.newsletterSubscription.findMany({
      orderBy: { createdAt: "desc" },
      take: 500,
      select: {
        id: true,
        email: true,
        kinds: true,
        verified: true,
        verifiedAt: true,
        unsubscribedAt: true,
        createdAt: true,
        lastSentAt: true,
      },
    }),
    prisma.newsletterSubscription.count(),
  ]);

  // Recent published posts so the admin can trigger a manual send
  // without needing to know slugs.
  const recentPosts = await prisma.blogPost.findMany({
    where: { kind: { in: ["monday-outlook", "friday-report", "weekly-report"] } },
    orderBy: { publishedAt: "desc" },
    take: 8,
    select: { slug: true, title: true, kind: true, publishedAt: true },
  });

  const verified = subs.filter((s) => s.verified && !s.unsubscribedAt).length;
  const unverified = subs.filter((s) => !s.verified && !s.unsubscribedAt).length;
  const unsubscribed = subs.filter((s) => s.unsubscribedAt != null).length;

  return NextResponse.json({
    totalRows: totals,
    counts: { verified, unverified, unsubscribed },
    subscribers: subs,
    recentPosts,
    hasResend: Boolean(process.env.RESEND_API_KEY),
  });
}

export async function POST(request: NextRequest) {
  const guard = await guardAdminRoute(request, { allowedKeys: ["analytics"] });
  if (!guard.ok) return guard.response;

  let body: {
    action?: string;
    id?: string;
    kind?: string;
    postSlug?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { action, id } = body;
  if (!action || !id) {
    return NextResponse.json(
      { error: "Missing action or id" },
      { status: 400 },
    );
  }

  const sub = await prisma.newsletterSubscription.findUnique({ where: { id } });
  if (!sub) return NextResponse.json({ error: "Not found" }, { status: 404 });

  switch (action) {
    case "verify": {
      await prisma.newsletterSubscription.update({
        where: { id },
        data: {
          verified: true,
          verifiedAt: new Date(),
          verifyToken: null,
          unsubscribedAt: null,
        },
      });
      return NextResponse.json({ ok: true });
    }
    case "unsubscribe": {
      await prisma.newsletterSubscription.update({
        where: { id },
        data: { unsubscribedAt: new Date(), kinds: [] },
      });
      return NextResponse.json({ ok: true });
    }
    case "resend-verify": {
      // Reissue a fresh token — invalidates any still-floating verify
      // link in the subscriber's inbox so a leaked URL can't be
      // clicked later to unexpectedly re-confirm.
      const { randomBytes } = await import("crypto");
      const verifyToken = randomBytes(32).toString("base64url");
      await prisma.newsletterSubscription.update({
        where: { id },
        data: { verifyToken, verified: false },
      });
      const result = await sendVerificationEmail({
        email: sub.email,
        verifyToken,
        unsubscribeToken: sub.unsubscribeToken,
      });
      return NextResponse.json({ ok: result.sent, result });
    }
    case "test-send": {
      const { kind, postSlug } = body;
      if (!kind || !postSlug) {
        return NextResponse.json(
          { error: "kind + postSlug required for test-send" },
          { status: 400 },
        );
      }
      const post = await prisma.blogPost.findUnique({
        where: { slug: postSlug },
        select: {
          slug: true,
          title: true,
          excerpt: true,
          content: true,
          publishedAt: true,
        },
      });
      if (!post) {
        return NextResponse.json({ error: "Post not found" }, { status: 404 });
      }
      // Temporarily restrict the fan-out to this one subscriber by
      // filtering the subscribers query to just their ID. We do this
      // by creating a throwaway send that bypasses the normal
      // "everybody who matches" query — simplest is to call the
      // verify-email path with the issue content.
      //
      // But we want the real issue template, so we call the issue
      // builder directly for this one recipient.
      const { buildIssueEmail } = await import("@/lib/newsletter/templates");
      const { getResend, SENDER_FROM, SENDER_REPLY_TO, SITE_ORIGIN } =
        await import("@/lib/newsletter/client");
      const client = getResend();
      if (!client) {
        return NextResponse.json(
          { error: "RESEND_API_KEY not set — cannot send test" },
          { status: 500 },
        );
      }
      const { subject, html, text } = buildIssueEmail({
        title: post.title,
        excerpt: post.excerpt,
        bodyMarkdown: post.content,
        postUrl: `${SITE_ORIGIN}/blog/${post.slug}`,
        kindLabel:
          kind === "monday-outlook"
            ? "Monday outlook"
            : kind === "friday-report" || kind === "weekly-report"
              ? "Friday wrap"
              : kind,
        unsubscribeUrl: `${SITE_ORIGIN}/api/newsletter/unsubscribe?token=${encodeURIComponent(sub.unsubscribeToken)}&kind=${encodeURIComponent(kind)}`,
      });
      const { error } = await client.emails.send({
        from: SENDER_FROM,
        to: [sub.email],
        replyTo: SENDER_REPLY_TO,
        subject: `[TEST] ${subject}`,
        html,
        text,
      });
      if (error) {
        return NextResponse.json(
          { error: error.message },
          { status: 500 },
        );
      }
      return NextResponse.json({ ok: true });
    }
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
