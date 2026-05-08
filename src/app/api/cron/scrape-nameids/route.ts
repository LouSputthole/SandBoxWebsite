import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fetchItemNameId } from "@/lib/steam/client";

/**
 * GET/POST /api/cron/scrape-nameids
 *
 * Auto-fills Item.steamItemNameId for any item that has a
 * steamMarketId but no nameid yet. The numeric nameid is required
 * for Steam's order-histogram endpoint (buy/sell orders on item
 * detail pages). Until 2026-05, the codebase assumed Steam blocks
 * HTML scrapes from Vercel datacenter IPs and required a manual
 * Windows-side script (scripts/scrape-nameids.ts). The probe at
 * /api/admin/nameid-scrape proved that assumption wrong — Vercel
 * returns 200 in ~250ms with browser-impersonation headers — so
 * the local script is now retired in favor of this cron.
 *
 * Rate limiting: 2s between requests, matching the local script's
 * cadence. Capped at 40 items per run so a single cron call
 * finishes inside Vercel's function timeout. The cron runs daily,
 * so a backlog of 80 items finishes in 2 days. POST without a body
 * triggers a manual run from the admin UI.
 *
 * CRON_SECRET-gated.
 */
export const maxDuration = 300;

const MAX_PER_RUN = 40;
const DELAY_MS = 2000;

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

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

  const startedAt = Date.now();
  const items = await prisma.item.findMany({
    where: { steamMarketId: { not: null }, steamItemNameId: null },
    select: { id: true, name: true, steamMarketId: true },
    orderBy: { name: "asc" },
    take: MAX_PER_RUN,
  });

  if (items.length === 0) {
    return NextResponse.json({
      ok: true,
      message: "No items missing steamItemNameId.",
      updated: 0,
      failed: 0,
      remaining: 0,
      elapsedMs: Date.now() - startedAt,
    });
  }

  let updated = 0;
  let failed = 0;
  const failures: { name: string; reason: string }[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    try {
      const nameId = await fetchItemNameId(item.steamMarketId!);
      if (nameId) {
        await prisma.item.update({
          where: { id: item.id },
          data: { steamItemNameId: nameId },
        });
        updated++;
      } else {
        failed++;
        failures.push({ name: item.name, reason: "nameid not found in HTML" });
      }
    } catch (err) {
      failed++;
      failures.push({
        name: item.name,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
    // Rate limit: skip the wait after the last item.
    if (i < items.length - 1) await sleep(DELAY_MS);
  }

  // How many remain after this run? Useful so the cron can self-
  // report whether a single pass cleared the backlog.
  const remaining = await prisma.item.count({
    where: { steamMarketId: { not: null }, steamItemNameId: null },
  });

  return NextResponse.json({
    ok: failed === 0,
    updated,
    failed,
    remaining,
    failures,
    elapsedMs: Date.now() - startedAt,
  });
}

export const GET = handle;
export const POST = handle;
