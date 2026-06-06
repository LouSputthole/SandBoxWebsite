import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { guardAdminRoute } from "@/lib/auth/admin-guard";
import { computeScarcityScore } from "@/lib/services/sync-service";

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

  let updated = 0;
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
          sboxSyncedAt: new Date(),
          scarcityScore,
        },
      });
      if (res.count > 0) updated += res.count;
      else notFound.push(slug);
    } catch (err) {
      skipped.push(`${slug}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return NextResponse.json({ ok: true, updated, notFound, skipped });
}
