import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { redis } from "@/lib/redis/client";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const MIN_BODY = 1;
const MAX_BODY = 1000;
// 10 comments per user per 10 minutes — generous enough that legit
// back-and-forth in a single thread isn't blocked, tight enough that
// a compromised account can't pollute every active listing in one go.
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_SEC = 600;

async function rateLimit(
  userId: string,
): Promise<{ ok: boolean; remaining: number }> {
  if (!redis) return { ok: true, remaining: RATE_LIMIT_MAX };
  try {
    const key = `rl:tcmt:${userId}`;
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, RATE_LIMIT_WINDOW_SEC);
    return {
      ok: count <= RATE_LIMIT_MAX,
      remaining: Math.max(0, RATE_LIMIT_MAX - count),
    };
  } catch {
    return { ok: true, remaining: RATE_LIMIT_MAX };
  }
}

/**
 * GET /api/trade/[id]/comments — public list of visible comments on a
 * listing. Soft-deleted rows omitted. Used by the client form to refresh
 * after posting; the page itself server-renders the thread inline.
 */
export async function GET(_request: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const comments = await prisma.tradeComment.findMany({
    where: { listingId: id, deletedAt: null },
    orderBy: { createdAt: "asc" },
    include: {
      user: {
        select: {
          id: true,
          steamId: true,
          username: true,
          avatarUrl: true,
        },
      },
    },
  });
  return NextResponse.json({ comments });
}

/**
 * POST /api/trade/[id]/comments — create a comment. Steam OAuth required.
 * Per-user rate limit; body length validated. Posting allowed on any
 * listing regardless of status so post-trade "+rep" notes work.
 */
export async function POST(request: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Sign in with Steam to comment" },
      { status: 401 },
    );
  }

  let body: { body?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const raw = typeof body.body === "string" ? body.body.trim() : "";
  if (raw.length < MIN_BODY) {
    return NextResponse.json(
      { error: "Comment can't be empty" },
      { status: 400 },
    );
  }
  if (raw.length > MAX_BODY) {
    return NextResponse.json(
      { error: `Comment too long (max ${MAX_BODY} chars)` },
      { status: 400 },
    );
  }

  const listing = await prisma.tradeListing.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!listing) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  const rl = await rateLimit(user.id);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Slow down — too many comments. Try again in a few minutes." },
      { status: 429 },
    );
  }

  const created = await prisma.tradeComment.create({
    data: { listingId: id, userId: user.id, body: raw },
    include: {
      user: {
        select: {
          id: true,
          steamId: true,
          username: true,
          avatarUrl: true,
        },
      },
    },
  });

  return NextResponse.json({ comment: created }, { status: 201 });
}
