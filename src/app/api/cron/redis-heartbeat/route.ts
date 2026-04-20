import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis/client";

/**
 * GET /api/cron/redis-heartbeat
 *
 * Writes a single short-TTL key to Redis once a day so Upstash (now
 * Redis Inc.) doesn't flag our free-tier DB as inactive and queue it
 * for deletion. Without this, low-traffic periods — nights, weekends,
 * quiet launch phases — let the database sit idle long enough to
 * trigger the 14-day inactivity warning → eventual reaping.
 *
 * The write is trivial (one string, 48-hour TTL). We use TTL rather
 * than permanent keys so the DB doesn't accumulate heartbeat cruft
 * if this cron ever runs more frequently than expected.
 */
async function handle(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!redis) {
    return NextResponse.json({
      ok: false,
      skipped: "redis-not-configured",
    });
  }

  try {
    const now = new Date().toISOString();
    // SET with 48h TTL — covers a missed daily run without leaving
    // zombie keys if this endpoint ever gets called more aggressively.
    await redis.set("heartbeat:last", now, { ex: 48 * 60 * 60 });
    return NextResponse.json({ ok: true, at: now });
  } catch (err) {
    console.error("[cron:redis-heartbeat] Redis write failed:", err);
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }
}

export const GET = handle;
export const POST = handle;
