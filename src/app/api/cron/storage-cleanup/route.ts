import { NextRequest, NextResponse } from "next/server";
import {
  downsamplePricePoints,
  rollupPageViews,
} from "@/lib/storage/downsample";

export const maxDuration = 300;

/**
 * Weekly cron — runs the downsampler + PageView rollup in non-dry-run
 * mode. Scheduled for Sunday 04:00 UTC (`vercel.json`) which is our
 * lowest-traffic window.
 *
 * Both operations are idempotent — Tier 2 collapsing already-hourly
 * rows is a no-op, rollupPageViews skips days already in DailyStats
 * if the raw rows are gone. So a missed week catches up on the next
 * run without duplication.
 *
 * Gated by CRON_SECRET. Operator can also trigger the dry-run versions
 * via the /admin/storage UI to see impact before enabling.
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

  try {
    const [downsample, rollup] = await Promise.all([
      downsamplePricePoints({ dryRun: false }),
      rollupPageViews({ dryRun: false }),
    ]);
    return NextResponse.json({ downsample, rollup });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export const GET = handle;
export const POST = handle;
