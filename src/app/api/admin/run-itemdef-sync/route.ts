import { NextRequest, NextResponse } from "next/server";
import { guardAdminRoute } from "@/lib/auth/admin-guard";
import { prisma } from "@/lib/db";
import {
  fetchSteamItemDefsWithDiag,
  parseSteamPrice,
  pickItemDescription,
} from "@/lib/steam/inventory";

/**
 * POST /api/admin/run-itemdef-sync
 *
 * Manually triggers the Steam item-def archive sync — same logic as
 * /api/cron/steam-itemdef-sync but accepts ANALYTICS_KEY or
 * CRON_SECRET via guardAdminRoute, so the operator can fire it from
 * /admin/debug without juggling the cron-only secret.
 *
 * GET aliased to POST so a phone-pasted URL also works.
 */
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const guard = await guardAdminRoute(request, {
    allowedKeys: ["analytics", "cron"],
  });
  if (!guard.ok) return guard.response;

  const startedAt = Date.now();
  const diag = await fetchSteamItemDefsWithDiag();
  if (!diag.ok || !diag.result) {
    return NextResponse.json(
      {
        ok: false,
        interpretation: diag.interpretation,
        attempts: diag.attempts,
      },
      { status: 502 },
    );
  }
  const archive = diag.result;

  const items = await prisma.item.findMany({
    where: { itemDefinitionId: { not: null } },
    select: {
      id: true,
      name: true,
      itemDefinitionId: true,
      storePrice: true,
      releasePrice: true,
      description: true,
    },
  });

  let priceFilled = 0;
  let descriptionFilled = 0;
  let matched = 0;
  let unmatched = 0;
  const sampleUnmatched: number[] = [];

  for (const it of items) {
    if (it.itemDefinitionId == null) continue;
    const def = archive.defsByItemdefid.get(it.itemDefinitionId);
    if (!def) {
      unmatched++;
      if (sampleUnmatched.length < 10) sampleUnmatched.push(it.itemDefinitionId);
      continue;
    }
    matched++;

    const data: Record<string, number | string> = {};
    if (it.storePrice == null && it.releasePrice == null) {
      const price = parseSteamPrice(def.price, "USD");
      if (price != null && price > 0) {
        data.storePrice = price;
        data.releasePrice = price;
      }
    }
    const desc = pickItemDescription(def);
    if (desc) {
      const isGenerated =
        !it.description || it.description.startsWith(`${it.name} is a`);
      if (isGenerated) data.description = desc;
    }
    if (Object.keys(data).length > 0) {
      await prisma.item.update({ where: { id: it.id }, data });
      if (data.storePrice != null) priceFilled++;
      if (data.description) descriptionFilled++;
    }
  }

  return NextResponse.json({
    ok: true,
    digest: archive.digest,
    archiveSize: archive.defsByItemdefid.size,
    candidateItems: items.length,
    matched,
    unmatched,
    sampleUnmatched,
    priceFilled,
    descriptionFilled,
    elapsedMs: Date.now() - startedAt,
  });
}

export const GET = POST;
