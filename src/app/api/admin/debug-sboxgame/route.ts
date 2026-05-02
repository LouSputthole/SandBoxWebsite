import { NextRequest, NextResponse } from "next/server";
import { guardAdminRoute } from "@/lib/auth/admin-guard";
import {
  fetchSboxGameMetrics,
  parseSboxGameMetrics,
} from "@/lib/services/sync-service";

/**
 * GET /api/admin/debug-sboxgame?id=756702
 *
 * Fetches sbox.game/metrics/skins/<id>, runs our extractor, and
 * returns both the parsed result and a snippet of the upstream HTML
 * so we can see what we're working with. id can be a workshopId or
 * any other numeric ID sbox.game accepts.
 *
 * Use this to verify the metrics scraper before turning on the
 * backfill cron, or to diagnose "why isn't this specific item
 * getting data."
 */
export async function GET(request: NextRequest) {
  const guard = await guardAdminRoute(request, {
    allowedKeys: ["analytics", "cron"],
  });
  if (!guard.ok) return guard.response;

  const id = request.nextUrl.searchParams.get("id");
  if (!id || !/^[a-z0-9-]+$/i.test(id)) {
    return NextResponse.json(
      { error: "id query param required (alphanumeric + dashes)" },
      { status: 400 },
    );
  }

  // Fetch directly so we can also return raw bytes for diagnosis.
  let upstreamStatus: number | null = null;
  let html = "";
  try {
    const res = await fetch(
      `https://sbox.game/metrics/skins/${encodeURIComponent(id)}`,
      { signal: AbortSignal.timeout(10000) },
    );
    upstreamStatus = res.status;
    html = await res.text();
  } catch (err) {
    return NextResponse.json(
      {
        error: "fetch failed",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }

  const parsed = parseSboxGameMetrics(html);
  // Also try the canonical fetcher in case the URL form differs
  // (encodeURIComponent vs raw, etc.)
  const fetcherResult = await fetchSboxGameMetrics(id);

  return NextResponse.json({
    id,
    upstreamStatus,
    bytes: html.length,
    parsed,
    fetcherResult,
    htmlSnippet: html.slice(0, 4000),
  });
}
