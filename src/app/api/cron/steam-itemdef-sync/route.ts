import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  fetchSteamItemDefs,
  parseSteamPrice,
  pickItemDescription,
} from "@/lib/steam/inventory";

/**
 * GET/POST /api/cron/steam-itemdef-sync
 *
 * Daily cron that pulls Steam's item-def archive (the same backend
 * the in-game store reads from) and backfills:
 *
 *   - storePrice / releasePrice — official store price in USD,
 *     parsed from Steam's "USD;1500;EUR;1400" format
 *   - description — the in-store marketing tagline ("Stay anonymous,
 *     yet adorable", "Add some depth to your life", etc.) when our
 *     row currently has the auto-generated fallback
 *
 * Only writes when target columns are null / generated, never
 * overwrites a value sbox.dev already populated for a column.
 *
 * One Steam API call gets EVERY item def in one shot, so the cron is
 * cheap regardless of catalog size.
 *
 * CRON_SECRET-gated. Idempotent — same digest twice in a row writes
 * nothing the second time.
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

  const startedAt = Date.now();
  const archive = await fetchSteamItemDefs();
  if (!archive) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Steam item-def archive fetch failed — check STEAM_API_KEY and Steam Web API status",
      },
      { status: 502 },
    );
  }

  // Pull every item where we have an itemDefinitionId. Update only
  // when the relevant column is null / generated.
  const items = await prisma.item.findMany({
    where: { itemDefinitionId: { not: null } },
    select: {
      id: true,
      name: true,
      slug: true,
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

    // Price backfill — only when both columns are null.
    if (it.storePrice == null && it.releasePrice == null) {
      const price = parseSteamPrice(def.price, "USD");
      if (price != null && price > 0) {
        data.storePrice = price;
        data.releasePrice = price;
      }
    }

    // Description backfill — replace auto-generated descriptions
    // (those start with "<name> is a ..." per the generator) with
    // the real Steam store tagline. Hand-edited descriptions keep.
    const newDescription = pickItemDescription(def);
    if (newDescription) {
      const isGenerated =
        !it.description ||
        it.description.startsWith(`${it.name} is a`);
      if (isGenerated) {
        data.description = newDescription;
      }
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

export const GET = handle;
export const POST = handle;
