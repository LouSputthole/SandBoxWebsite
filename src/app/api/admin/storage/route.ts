import { NextRequest, NextResponse } from "next/server";
import { guardAdminRoute } from "@/lib/auth/admin-guard";
import { getDatabaseStats } from "@/lib/storage/stats";
import {
  downsamplePricePoints,
  rollupPageViews,
} from "@/lib/storage/downsample";

export const maxDuration = 300;

/**
 * GET  /api/admin/storage               — per-table sizes + row counts
 * POST /api/admin/storage               — run cleanup actions
 *   { action: "downsample-dry-run" | "downsample" }
 *   { action: "rollup-pageviews-dry-run" | "rollup-pageviews" }
 *
 * Gated by ANALYTICS_KEY. Downsample + rollup endpoints are destructive
 * in non-dry-run mode — admin only.
 */
export async function GET(request: NextRequest) {
  const guard = await guardAdminRoute(request, { allowedKeys: ["analytics"] });
  if (!guard.ok) return guard.response;
  const stats = await getDatabaseStats();
  return NextResponse.json(stats);
}

export async function POST(request: NextRequest) {
  const guard = await guardAdminRoute(request, { allowedKeys: ["analytics"] });
  if (!guard.ok) return guard.response;

  let body: { action?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  switch (body.action) {
    case "downsample-dry-run": {
      const report = await downsamplePricePoints({ dryRun: true });
      return NextResponse.json(report);
    }
    case "downsample": {
      const report = await downsamplePricePoints({ dryRun: false });
      return NextResponse.json(report);
    }
    case "rollup-pageviews-dry-run": {
      const report = await rollupPageViews({ dryRun: true });
      return NextResponse.json(report);
    }
    case "rollup-pageviews": {
      const report = await rollupPageViews({ dryRun: false });
      return NextResponse.json(report);
    }
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
