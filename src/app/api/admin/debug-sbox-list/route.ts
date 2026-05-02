import { NextRequest, NextResponse } from "next/server";
import { guardAdminRoute } from "@/lib/auth/admin-guard";
import { fetchSboxSkinsListDetailed } from "@/lib/services/sync-service";

/**
 * GET /api/admin/debug-sbox-list
 *
 * Runs the full discovery probe (every API candidate URL + every HTML
 * scrape fallback) and returns:
 *   - source: which URL actually returned skins, or null
 *   - count: how many skins came back
 *   - attempts: per-URL status, byte size, parsed count, error
 *   - sampleSlugs: first 5 slugs (sanity check that we got real items)
 *
 * No DB writes — discover-cron does the actual seeding. This route is
 * purely for triaging "why is discovery returning 0?"
 */
export async function GET(request: NextRequest) {
  const guard = await guardAdminRoute(request, {
    allowedKeys: ["analytics", "cron"],
  });
  if (!guard.ok) return guard.response;

  const detailed = await fetchSboxSkinsListDetailed();

  return NextResponse.json({
    source: detailed.source,
    count: detailed.skins.length,
    sampleSlugs: detailed.skins.slice(0, 5).map((s) => s.slug),
    attempts: detailed.attempts,
  });
}
