import { NextRequest, NextResponse } from "next/server";
import { discoverSboxSkins } from "@/lib/services/sync-service";

/**
 * GET/POST /api/cron/sbox-discover
 *
 * Pulls sbox.dev's catalog list, seeds any new skins not yet in our
 * DB, and flips rotation flags (isActiveStoreItem, isPermanentStoreItem,
 * leavingStoreAt) for known items immediately. Bypasses the 1h per-
 * item enrichment cooldown so store rotations show up within the
 * discover cadence (4x/day) rather than the next paginated sync.
 *
 * CRON_SECRET-gated. Idempotent — running twice in a row is a no-op
 * for already-seeded items and a few wasted API calls for the rest.
 */
export const maxDuration = 120;

async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await discoverSboxSkins();
  return NextResponse.json({ ok: true, ...result });
}

export const GET = handle;
export const POST = handle;
