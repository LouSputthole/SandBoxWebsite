import { NextRequest, NextResponse } from "next/server";
import { generateAndSaveWeeklyReport } from "@/lib/blog/weekly-report";

/**
 * Generates this week's market report blog post (idempotent on slug).
 * Hit from a Friday cron, or manually via POST with CRON_SECRET.
 */
async function handle(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await generateAndSaveWeeklyReport();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
