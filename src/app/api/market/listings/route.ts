import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { marketGate } from "@/lib/market/access-server";
import { MarketBannedError } from "@/lib/market/bans";
import { createListing, getActiveListings, SellerNotReadyError } from "@/lib/market/listing-service";
import {
  fetchInventoryItems,
  InventoryPrivateError,
  SteamInventoryUnavailableError,
} from "@/lib/market/steam-inventory";

export const dynamic = "force-dynamic";

const MAX_PRICE_USD = 1_000_000;
const norm = (s: string) => s.trim().toLowerCase();

/** Parse a query int, clamped to [min,max]; falls back to `def` for missing/non-numeric. */
function clampInt(raw: string | null, def: number, min: number, max: number): number {
  const n = raw == null ? def : Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return def;
  return Math.min(Math.max(n, min), max);
}

/** GET /api/market/listings?itemId=&take=&skip= — active listings for the browse page. */
export async function GET(request: NextRequest) {
  const gate = await marketGate();
  if (gate) return gate;
  try {
    const sp = request.nextUrl.searchParams;
    const listings = await getActiveListings({
      itemId: sp.get("itemId") ?? undefined,
      take: clampInt(sp.get("take"), 50, 1, 100),
      skip: clampInt(sp.get("skip"), 0, 0, 100_000),
    });
    return NextResponse.json({ listings });
  } catch (err) {
    console.error("[market] GET /listings failed", err);
    return NextResponse.json({ error: "Could not load listings" }, { status: 500 });
  }
}

/** POST /api/market/listings — create a listing for an item the caller actually owns. */
export async function POST(request: NextRequest) {
  const gate = await marketGate();
  if (gate) return gate;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: {
    itemId?: string;
    steamAssetId?: string;
    classId?: string;
    instanceId?: string;
    priceUsd?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { itemId, steamAssetId, classId, instanceId, priceUsd } = body;
  if (!itemId || !steamAssetId || !classId || !instanceId || typeof priceUsd !== "number") {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }
  if (!Number.isFinite(priceUsd) || priceUsd <= 0 || priceUsd > MAX_PRICE_USD) {
    return NextResponse.json({ error: "Price must be a positive amount under $1,000,000" }, { status: 400 });
  }

  // Ownership AND item-binding: the exact owned copy must exist, and its Steam name must match the
  // advertised catalog item. Without the name match a seller could advertise item A while binding
  // delivery to a cheap junk skin B they own — the oracle only enforces the class, not the catalog
  // identity the buyer sees.
  try {
    const [inv, catalogItem] = await Promise.all([
      fetchInventoryItems(user.steamId),
      prisma.item.findUnique({ where: { id: itemId }, select: { name: true } }),
    ]);
    if (!catalogItem) return NextResponse.json({ error: "Unknown item" }, { status: 400 });
    const owned = inv.find(
      (i) => i.assetId === steamAssetId && i.classId === classId && i.instanceId === instanceId,
    );
    if (!owned) {
      return NextResponse.json(
        { error: "That item isn't in your inventory (make sure your inventory is public)" },
        { status: 422 },
      );
    }
    if (norm(owned.name) !== norm(catalogItem.name)) {
      return NextResponse.json(
        { error: "That item doesn't match the listing you're creating" },
        { status: 422 },
      );
    }
  } catch (err) {
    if (err instanceof InventoryPrivateError) {
      return NextResponse.json({ error: "Set your Steam inventory to public first" }, { status: 422 });
    }
    if (err instanceof SteamInventoryUnavailableError) {
      return NextResponse.json({ error: "Steam inventory is temporarily unavailable — try again" }, { status: 503 });
    }
    return NextResponse.json({ error: "Couldn't read your Steam inventory" }, { status: 502 });
  }

  try {
    const listing = await createListing({
      sellerId: user.id,
      itemId,
      steamAssetId,
      classId,
      instanceId,
      priceUsd,
    });
    return NextResponse.json({ listing }, { status: 201 });
  } catch (err) {
    // Banned seller (Steam id or wallet) — never allowed to list. TOS enforcement.
    if (err instanceof MarketBannedError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    if (err instanceof SellerNotReadyError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    if (err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "That item is already listed" }, { status: 409 });
    }
    throw err;
  }
}
