import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * GET    /api/admin/tweet/schedule        — list pending scheduled tweets
 * POST   /api/admin/tweet/schedule        — create a new scheduled tweet
 * DELETE /api/admin/tweet/schedule?id=... — cancel a scheduled tweet
 *
 * All endpoints accept either CRON_SECRET or ANALYTICS_KEY as a Bearer token.
 * The admin UI sends the user's typed admin key.
 */

function isAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const adminKey = process.env.ANALYTICS_KEY;
  const authHeader = request.headers.get("authorization");
  return (
    (cronSecret != null && authHeader === `Bearer ${cronSecret}`) ||
    (adminKey != null && authHeader === `Bearer ${adminKey}`)
  );
}

function extractItemSlug(text: string): string | null {
  const match = text.match(/sboxskins\.gg\/items\/([a-z0-9-]+)/);
  return match ? match[1] : null;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Return upcoming pending tweets and recent activity (last 7 days)
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const scheduled = await prisma.scheduledTweet.findMany({
    where: {
      OR: [
        { status: "pending" },
        { createdAt: { gte: since } },
      ],
    },
    orderBy: [{ status: "asc" }, { scheduledFor: "asc" }],
    take: 100,
  });

  return NextResponse.json({
    scheduled: scheduled.map((s) => ({
      ...s,
      scheduledFor: s.scheduledFor.toISOString(),
      attemptedAt: s.attemptedAt?.toISOString() ?? null,
      createdAt: s.createdAt.toISOString(),
    })),
  });
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { text?: string; scheduledFor?: string; kind?: string; inReplyToTweetId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
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
  if (!body.scheduledFor) {
    return NextResponse.json({ error: "Missing 'scheduledFor' field" }, { status: 400 });
  }
  const scheduledFor = new Date(body.scheduledFor);
  if (Number.isNaN(scheduledFor.getTime())) {
    return NextResponse.json({ error: "Invalid 'scheduledFor' date" }, { status: 400 });
  }
  if (scheduledFor.getTime() < Date.now() - 60_000) {
    // Allow 1-minute clock skew, but anything in the past is rejected
    return NextResponse.json(
      { error: "scheduledFor must be in the future" },
      { status: 400 },
    );
  }

  const created = await prisma.scheduledTweet.create({
    data: {
      text: body.text,
      scheduledFor,
      kind: body.kind ?? "scheduled",
      inReplyToTweetId: body.inReplyToTweetId ?? null,
      itemSlug: extractItemSlug(body.text),
    },
  });

  return NextResponse.json({
    success: true,
    scheduled: {
      ...created,
      scheduledFor: created.scheduledFor.toISOString(),
      attemptedAt: created.attemptedAt?.toISOString() ?? null,
      createdAt: created.createdAt.toISOString(),
    },
  });
}

export async function DELETE(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id query parameter required" }, { status: 400 });
  }

  // Only cancel pending tweets — already-posted ones can't be unsent
  const result = await prisma.scheduledTweet.updateMany({
    where: { id, status: "pending" },
    data: { status: "cancelled" },
  });

  if (result.count === 0) {
    return NextResponse.json(
      { error: "Scheduled tweet not found or already posted/cancelled" },
      { status: 404 },
    );
  }

  return NextResponse.json({ success: true });
}
