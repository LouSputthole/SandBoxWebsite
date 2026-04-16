import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * GET /api/cron/trade-expire — Flip `active` listings whose expiresAt has
 * passed to `expired`. Cheap query (indexed on status+expiresAt). Runs
 * hourly via Vercel cron — granularity finer than that is pointless when
 * users post for 14+ days at a time.
 */
async function handle(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await prisma.tradeListing.updateMany({
    where: { status: "active", expiresAt: { lte: new Date() } },
    data: { status: "expired" },
  });

  console.log(`[cron:trade-expire] Expired ${result.count} listings`);
  return NextResponse.json({ expired: result.count });
}

export const GET = handle;
export const POST = handle;
