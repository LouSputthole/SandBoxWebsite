import { NextRequest, NextResponse } from "next/server";
import { generateAndSaveMondayOutlook } from "@/lib/blog/monday-outlook";

export const maxDuration = 300;

/**
 * Generates Monday's forward-looking market outlook post. Hit from a
 * Monday cron (see vercel.json) or manually via POST with CRON_SECRET.
 * Idempotent on weekly slug.
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
    const result = await generateAndSaveMondayOutlook();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
