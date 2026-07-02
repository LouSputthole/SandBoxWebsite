import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { marketGate } from "@/lib/market/access-server";
import { MarketBannedError } from "@/lib/market/bans";
import { createOrder } from "@/lib/market/order-service";
import { serializeOrder } from "@/lib/market/serialize";
import { InventoryPrivateError } from "@/lib/market/steam-inventory";

export const dynamic = "force-dynamic";

/**
 * POST /api/market/orders — buyer commits to a listing. Snapshots their inventory, creates a
 * PENDING order, and returns the buyer-signed open_escrow transaction to sign. Body: { listingId }.
 *
 * Response (201): { order, openTx: { txBase64: string | null } }. `txBase64` null = nothing to sign
 * (mock/dev) → the client immediately calls POST .../[id]/fund with an empty body. Otherwise the
 * client signs the tx in Phantom and posts it to .../[id]/fund. No funds move until that call.
 */
export async function POST(request: NextRequest) {
  const gate = await marketGate();
  if (gate) return gate;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: { listingId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.listingId) return NextResponse.json({ error: "Missing listingId" }, { status: 400 });

  try {
    const { order, txBase64 } = await createOrder({
      listingId: body.listingId,
      buyerId: user.id,
      buyerSteamId64: user.steamId,
    });
    return NextResponse.json({ order: serializeOrder(order), openTx: { txBase64 } }, { status: 201 });
  } catch (err) {
    // Banned buyer (Steam id or wallet) — never allowed to fund. TOS enforcement.
    if (err instanceof MarketBannedError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    if (err instanceof InventoryPrivateError) {
      return NextResponse.json({ error: "Set your Steam inventory to public first" }, { status: 422 });
    }
    // Prisma unique-violation on the live-order-per-listing index → someone's already buying it.
    if (err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "This item is already being purchased" }, { status: 409 });
    }
    const message = err instanceof Error ? err.message : "Could not create order";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
