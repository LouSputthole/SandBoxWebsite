import { NextRequest, NextResponse } from "next/server";
import { guardAdminRoute } from "@/lib/auth/admin-guard";
import { discoverSboxSkins } from "@/lib/services/sync-service";

/**
 * POST /api/admin/run-discover
 *
 * Manually triggers the sbox.dev catalog discovery pass — same logic
 * as /api/cron/sbox-discover, but accepts ANALYTICS_KEY or CRON_SECRET
 * (via guardAdminRoute) so the operator can fire it from /admin/debug
 * without needing the cron-only secret in the browser.
 *
 * Returns the same { listSize, newItemsSeeded, rotationFlipped,
 * errors, elapsedMs } shape so the debug page renders the same JSON.
 */
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const guard = await guardAdminRoute(request, {
    allowedKeys: ["analytics", "cron"],
  });
  if (!guard.ok) return guard.response;

  const result = await discoverSboxSkins();
  return NextResponse.json({ ok: true, ...result });
}

// GET also accepted so a phone-pasted URL works without a separate
// fetch-with-body call.
export const GET = POST;
