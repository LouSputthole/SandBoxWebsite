import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { guardAdminRoute } from "@/lib/auth/admin-guard";
import {
  computeScarcityScore,
  normalizeRarityColor,
  seedItemFromSboxPayload,
  type SboxSkinData,
} from "@/lib/services/sync-service";
import type { SyncResult } from "@/lib/steam/types";
import { invalidatePattern } from "@/lib/redis/cache";

/**
 * POST /api/admin/enrich-items
 *
 * Ingest sbox.dev enrichment fetched from OUTSIDE Vercel.
 *
 * sbox.dev sits behind Cloudflare, which 403s Vercel's datacenter IPs
 * (confirmed 2026-06-06: api.sbox.dev → 403 from Vercel, 200 from a
 * residential / GitHub-runner IP). So the in-app sbox sync (syncSboxData)
 * silently enriched nothing from ~2026-05-19 on. Instead, the scheduled
 * GitHub Action `.github/workflows/enrich-sbox.yml` fetches sbox.dev from
 * a runner IP Cloudflare allows and POSTs the raw per-skin payloads here;
 * this endpoint applies the same field-mapping + scarcity score the
 * in-app sync would have and writes them to the matching Item rows.
 *
 * Body: { items: [{ slug, skin, supply? }] }
 *   - skin   = the `data` object from GET /v1/skins/<slug>
 *   - supply = the `data` object from GET /v1/skins/<slug>/supply-sources (optional)
 *
 * Auth: ANALYTICS_KEY or CRON_SECRET (guardAdminRoute).
 */

interface SboxSkinPayload {
  // Identity — required to CREATE a row when the slug isn't already in our DB.
  name?: string | null;
  slug?: string | null;
  marketable?: boolean | null;
  // Drop-item fields.
  isDroppableItem?: boolean | null;
  droppedUnits?: number | null;
  rarity?: string | null;
  rarityColor?: string | null;
  // Pre-resolved icon (the GitHub Action resolves it; Vercel can't scrape sbox.dev).
  iconUrl?: string | null;
  totalSupply?: number | null;
  uniqueOwners?: number | null;
  supplyOnMarket?: number | null;
  soldPast24H?: number | null;
  boughtInTheLast24H?: number | null;
  sales?: number | null;
  price?: number | null;
  priceChange24hPercent?: number | null;
  priceChange6h?: number | null;
  priceChange6hPercent?: number | null;
  isActiveStoreItem?: boolean | null;
  isPermanentStoreItem?: boolean | null;
  leavingStoreAt?: string | null;
  release?: string | null;
  releasePrice?: number | null;
  itemDisplayName?: string | null;
  category?: string | null;
  itemType?: string | null;
  workshopId?: string | null;
  itemDefinitionId?: number | null;
  iconBackgroundColor?: string | null;
}

interface SupplyHolder {
  profile?: { name?: string; steamId?: string; avatarUrl?: string };
  quantity?: number;
  inventoryValueSharePercent?: number;
}
interface SboxSupplyPayload {
  topHolders?: SupplyHolder[] | null;
}

interface EnrichEntry {
  slug?: string;
  skin?: SboxSkinPayload;
  supply?: SboxSupplyPayload | null;
}

const SLUG_RE = /^[a-z0-9-]+$/;
const MAX_ITEMS = 200;

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
      { error: "Provide { items: [{ slug, skin }] }" },
      { status: 400 },
    );
  }
  if (rawItems.length > MAX_ITEMS) {
    return NextResponse.json(
      { error: `Too many items (max ${MAX_ITEMS})` },
      { status: 400 },
    );
  }

  // Tweet new drops by default; the backfill sends { announce: false } so
  // week-old items we're only-now discovering don't get announced.
  const announce =
    (body as { announce?: boolean })?.announce !== false;

  let updated = 0;
  const created: string[] = [];
  const newlyCreated: { slug: string; skin: SboxSkinPayload }[] = [];
  const notFound: string[] = [];
  const skipped: string[] = [];

  for (const raw of rawItems) {
    const entry = (raw && typeof raw === "object" ? raw : {}) as EnrichEntry;
    const slug = typeof entry.slug === "string" ? entry.slug.trim() : "";
    const skin = entry.skin;
    const supply = entry.supply ?? null;

    if (!SLUG_RE.test(slug) || !skin || typeof skin !== "object") {
      skipped.push(slug || "(invalid)");
      continue;
    }

    const soldPast24h = skin.soldPast24H ?? skin.boughtInTheLast24H ?? null;

    // Mirror syncSboxData's holder shape. Default missing sub-fields to
    // empty/0 so the JSON column never stores nulls (keeps the value a
    // clean InputJsonValue).
    const topHolders = supply
      ? (supply.topHolders ?? []).map((h) => ({
          name: h.profile?.name ?? "",
          steamId: h.profile?.steamId ?? "",
          avatarUrl: h.profile?.avatarUrl ?? "",
          quantity: h.quantity ?? 0,
          sharePercent: h.inventoryValueSharePercent ?? 0,
        }))
      : undefined;

    const scarcityScore = computeScarcityScore({
      totalSupply: skin.totalSupply ?? null,
      uniqueOwners: skin.uniqueOwners ?? null,
      supplyOnMarket: skin.supplyOnMarket ?? null,
      soldPast24h,
      price: skin.price ?? null,
      priceChange24hPercent: skin.priceChange24hPercent ?? null,
    });

    const storeStatus =
      skin.isActiveStoreItem === true
        ? "available"
        : skin.isActiveStoreItem === false
          ? "delisted"
          : undefined;

    try {
      const res = await prisma.item.updateMany({
        where: { slug },
        data: {
          totalSupply: skin.totalSupply ?? null,
          uniqueOwners: skin.uniqueOwners ?? null,
          soldPast24h,
          supplyOnMarket: skin.supplyOnMarket ?? null,
          totalSales: skin.sales ?? null,
          // Only touch the store booleans when the payload actually has
          // them — never clobber a known value with null.
          ...(typeof skin.isActiveStoreItem === "boolean"
            ? { isActiveStoreItem: skin.isActiveStoreItem }
            : {}),
          ...(typeof skin.isPermanentStoreItem === "boolean"
            ? { isPermanentStoreItem: skin.isPermanentStoreItem }
            : {}),
          leavingStoreAt: skin.leavingStoreAt
            ? new Date(skin.leavingStoreAt)
            : null,
          releaseDate: skin.release ? new Date(skin.release) : null,
          releasePrice: skin.releasePrice ?? null,
          ...(skin.releasePrice != null
            ? { storePrice: skin.releasePrice }
            : {}),
          itemDisplayName: skin.itemDisplayName ?? null,
          category: skin.category ?? null,
          itemSubType: skin.itemType ?? null,
          workshopId: skin.workshopId ?? null,
          itemDefinitionId: skin.itemDefinitionId ?? null,
          priceChange6h: skin.priceChange6h ?? null,
          priceChange6hPercent: skin.priceChange6hPercent ?? null,
          iconBackgroundColor: skin.iconBackgroundColor ?? null,
          ...(topHolders !== undefined
            ? { topHolders: topHolders as Prisma.InputJsonValue }
            : {}),
          ...(storeStatus !== undefined ? { storeStatus } : {}),
          // Drop-item fields (only-when-present so we never null a known value).
          ...(typeof skin.isDroppableItem === "boolean"
            ? { isDroppableItem: skin.isDroppableItem }
            : {}),
          ...(skin.droppedUnits != null ? { droppedUnits: skin.droppedUnits } : {}),
          ...(skin.rarity ? { rarity: skin.rarity } : {}),
          // Validate hex via normalizeRarityColor (matches the create path +
          // syncSboxData) so a malformed color can't slip through the update.
          ...(skin.rarityColor && normalizeRarityColor(skin.rarityColor)
            ? { rarityColor: normalizeRarityColor(skin.rarityColor)! }
            : {}),
          sboxSyncedAt: new Date(),
          scarcityScore,
        },
      });
      if (res.count > 0) {
        updated += res.count;
      } else if (skin.name) {
        // No existing row by slug — create it (discovery). seedItemFromSboxPayload
        // also tries a name match first, so a slug that differs from sbox.dev's
        // (e.g. our "snapback-black" vs sbox "black-snapback") refreshes the
        // existing row instead of duplicating.
        const seedRes: SyncResult = {
          success: true,
          itemsProcessed: 0,
          itemsCreated: 0,
          itemsUpdated: 0,
          pricePointsCreated: 0,
          errors: [],
          duration: 0,
        };
        const seeded = await seedItemFromSboxPayload(
          slug,
          skin as unknown as SboxSkinData,
          seedRes,
          skin.iconUrl ?? null,
        );
        if (seeded.created) {
          created.push(slug);
          newlyCreated.push({ slug, skin });
        } else if (seeded.itemId) {
          updated++; // matched an existing row by name — refreshed, not new
        } else {
          notFound.push(slug);
        }
      } else {
        notFound.push(slug);
      }
    } catch (err) {
      skipped.push(`${slug}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Announce genuinely-new drops via the existing scheduled-tweet pipeline
  // (the tweet-dispatcher cron posts pending rows every 5 min). Only items
  // we just CREATED and that sbox.dev released within the last 48h — so a
  // backlog backfill (announce:false) and stale finds never tweet. Deduped
  // by an existing new-drop ScheduledTweet for the same slug.
  const TWEET_WINDOW_MS = 48 * 60 * 60 * 1000;
  // Burst guard: a single run should never fire more than a handful of tweets
  // (defense-in-depth vs. a sudden flood of new sitemap entries or a misused
  // announce flag). Real drops arrive a few at a time.
  const MAX_NEW_DROP_TWEETS = 5;
  // sbox.dev fields land in a PUBLIC tweet — sanitize at this trust boundary:
  // collapse control chars/whitespace, and parse dates/numbers defensively so a
  // malformed payload can't inject newlines or crash on an invalid date.
  const cleanText = (s: string) =>
    s.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();
  const isoDay = (raw: string | null | undefined): string | null => {
    if (!raw) return null;
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  };
  if (announce && newlyCreated.length > 0) {
    let enqueued = 0;
    for (const { slug, skin } of newlyCreated) {
      if (enqueued >= MAX_NEW_DROP_TWEETS) break;
      const releasedAt = skin.release ? new Date(skin.release).getTime() : null;
      if (
        releasedAt === null ||
        Number.isNaN(releasedAt) ||
        Date.now() - releasedAt > TWEET_WINDOW_MS
      ) {
        continue;
      }

      const dup = await prisma.scheduledTweet.findFirst({
        where: { itemSlug: slug, kind: "new-drop" },
        select: { id: true },
      });
      if (dup) continue;

      const url = `https://sboxskins.gg/items/${slug}`;
      const name = cleanText(skin.name ?? slug);
      const rarity = skin.rarity ? cleanText(skin.rarity) : null;
      const price =
        typeof skin.releasePrice === "number" &&
        Number.isFinite(skin.releasePrice) &&
        skin.releasePrice > 0
          ? skin.releasePrice
          : null;
      const units =
        typeof skin.droppedUnits === "number" &&
        Number.isFinite(skin.droppedUnits) &&
        skin.droppedUnits > 0
          ? skin.droppedUnits
          : null;
      const leaves = isoDay(skin.leavingStoreAt);
      const text = skin.isDroppableItem
        ? `New S&box drop: ${name} 🆕 — in-game drop${
            rarity ? ` (${rarity})` : ""
          }${units ? `, ${units.toLocaleString()} dropped` : ""}. ${url}`
        : `New S&box drop: ${name} 🆕${price ? ` — $${price.toFixed(2)}` : ""}${
            leaves ? `, leaves store ${leaves}` : ""
          }. ${url}`;

      try {
        await prisma.scheduledTweet.create({
          data: {
            text: text.slice(0, 280),
            scheduledFor: new Date(),
            kind: "new-drop",
            itemSlug: slug,
          },
        });
        enqueued++;
      } catch (err) {
        // Non-fatal — the item is already on the site; a failed tweet enqueue
        // shouldn't fail the ingest.
        skipped.push(
          `tweet ${slug}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  // Bust the read caches so the fresh supply/owner/category/scarcity
  // values actually surface — /api/items, item detail, etc. all read
  // through Redis (mirrors what /api/sync does after a write).
  if (created.length > 0 || updated > 0) {
    await invalidatePattern("items:*");
    await invalidatePattern("item:*");
  }

  return NextResponse.json({ ok: true, created, updated, notFound, skipped });
}
