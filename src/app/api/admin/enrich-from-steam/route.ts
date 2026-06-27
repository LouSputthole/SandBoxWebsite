import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guardAdminRoute } from "@/lib/auth/admin-guard";
import {
  normalizeRarityColor,
  seedItemFromSboxPayload,
  type SboxSkinData,
} from "@/lib/services/sync-service";
import type { SyncResult } from "@/lib/steam/types";
import { invalidatePattern } from "@/lib/redis/cache";

/**
 * POST /api/admin/enrich-from-steam
 *
 * First-party catalog enrichment from STEAM (not sbox.dev). s&box skins are
 * Steam Inventory Service items (appid 590830); a headless Steamworks worker
 * (tools/itemdef-spike) reads `ISteamInventory` item definitions and POSTs the
 * itemdef-sourced fields here.
 *
 * WHY a separate endpoint from /api/admin/enrich-items: that route's update
 * path overwrites supply/owners/price/category with the payload value (null
 * included), which is correct for the sbox.dev relay (it always sends full
 * data) but would WIPE those columns if fed itemdef-only data (itemdefs carry
 * no supply/owner/live-price). This endpoint therefore writes ONLY the fields
 * Steam itemdefs are authoritative for, all only-when-present, and NEVER
 * touches totalSupply / uniqueOwners / currentPrice / scarcity. Supply + price
 * stay owned by the Steam Market sync.
 *
 * Body: { items: [{ slug, def }] }
 *   def = { name, rarity?, rarityColor?, itemDefinitionId?, isDroppableItem?,
 *           release?, iconUrl? }   (release/iconUrl used only when CREATING)
 *
 * New-drop tweets are NOT enqueued here (Phase 1) — the sbox.dev relay
 * (enrich-items) still owns announcements.
 *
 * Auth: ANALYTICS_KEY or CRON_SECRET (guardAdminRoute).
 */

interface SteamDef {
  name?: string | null;
  rarity?: string | null;
  rarityColor?: string | null;
  itemDefinitionId?: number | null;
  isDroppableItem?: boolean | null;
  release?: string | null;
  iconUrl?: string | null;
}
interface Entry {
  slug?: string;
  def?: SteamDef;
}

const SLUG_RE = /^[a-z0-9-]+$/;
const MAX_ITEMS = 300;

/** The only-when-present, supply/price-safe subset Steam itemdefs own. */
function safeUpdateData(def: SteamDef) {
  const color = def.rarityColor ? normalizeRarityColor(def.rarityColor) : null;
  return {
    ...(def.rarity ? { rarity: def.rarity } : {}),
    ...(color ? { rarityColor: color } : {}),
    ...(def.itemDefinitionId != null
      ? { itemDefinitionId: def.itemDefinitionId }
      : {}),
    ...(typeof def.isDroppableItem === "boolean"
      ? { isDroppableItem: def.isDroppableItem }
      : {}),
  };
}

export async function POST(request: NextRequest) {
  const guard = await guardAdminRoute(request, {
    allowedKeys: ["analytics", "cron"],
  });
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rawItems =
    body &&
    typeof body === "object" &&
    Array.isArray((body as { items?: unknown }).items)
      ? (body as { items: unknown[] }).items
      : null;
  if (!rawItems) {
    return NextResponse.json(
      { error: "Provide { items: [{ slug, def }] }" },
      { status: 400 },
    );
  }
  if (rawItems.length > MAX_ITEMS) {
    return NextResponse.json(
      { error: `Too many items (max ${MAX_ITEMS})` },
      { status: 400 },
    );
  }

  let updated = 0;
  const created: string[] = [];
  const notFound: string[] = [];
  const skipped: string[] = [];

  for (const raw of rawItems) {
    const entry = (raw && typeof raw === "object" ? raw : {}) as Entry;
    const slug = typeof entry.slug === "string" ? entry.slug.trim() : "";
    const def = entry.def;
    if (!SLUG_RE.test(slug) || !def || typeof def !== "object") {
      skipped.push(slug || "(invalid)");
      continue;
    }

    const data = safeUpdateData(def);

    try {
      // Resolve any existing row authoritatively (slug, then name) BEFORE the
      // create path, so a pre-existing row is ALWAYS a safe partial update and
      // never reaches seedItemFromSboxPayload's full-overwrite update branch
      // (which would null currentPrice/releasePrice). This must not be gated on
      // `data` being non-empty — an empty safe-subset still must not fall
      // through to create when the row already exists.
      let existing = await prisma.item.findUnique({
        where: { slug },
        select: { id: true },
      });
      if (!existing && def.name) {
        existing = await prisma.item.findFirst({
          where: { name: { equals: def.name, mode: "insensitive" } },
          select: { id: true },
        });
      }

      if (existing) {
        if (Object.keys(data).length > 0) {
          await prisma.item.update({ where: { id: existing.id }, data });
        }
        updated++;
        continue;
      }

      // Genuinely new — create a minimal row (supply/price left null, as for any
      // freshly-discovered drop). seed only runs here, where no row exists, so
      // its update branch can't fire.
      if (!def.name) {
        notFound.push(slug);
        continue;
      }
      const seedRes: SyncResult = {
        success: true,
        itemsProcessed: 0,
        itemsCreated: 0,
        itemsUpdated: 0,
        pricePointsCreated: 0,
        errors: [],
        duration: 0,
      };
      const skin = {
        name: def.name,
        rarity: def.rarity ?? null,
        rarityColor: def.rarityColor ?? null,
        itemDefinitionId: def.itemDefinitionId ?? null,
        isDroppableItem: def.isDroppableItem ?? false,
        release: def.release ?? null,
        iconUrl: def.iconUrl ?? null,
      } as unknown as SboxSkinData;
      const seeded = await seedItemFromSboxPayload(
        slug,
        skin,
        seedRes,
        def.iconUrl ?? null,
      );
      if (seeded.created) created.push(slug);
      else if (seeded.itemId) updated++;
      else notFound.push(slug);
    } catch (err) {
      skipped.push(
        `${slug}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  if (created.length > 0 || updated > 0) {
    await invalidatePattern("items:*");
    await invalidatePattern("item:*");
  }

  return NextResponse.json({
    ok: true,
    source: "steam-itemdef",
    created,
    updated,
    notFound,
    skipped,
  });
}
