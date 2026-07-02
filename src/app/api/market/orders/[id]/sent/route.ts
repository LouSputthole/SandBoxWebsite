import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { marketGate } from "@/lib/market/access-server";
import { markSellerSent } from "@/lib/market/order-service";

export const dynamic = "force-dynamic";

/** POST /api/market/orders/[id]/sent — seller marks the Steam trade offer sent.
 *  Body: { tradeOfferId } — REQUIRED; it is the oracle's primary delivery evidence. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await marketGate();
  if (gate) return gate;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { id } = await params;
  let body: { tradeOfferId?: string } = {};
  try {
    body = await request.json();
  } catch {
    // fall through — markSellerSent rejects a missing/invalid trade offer id
  }

  try {
    await markSellerSent(id, user.id, body.tradeOfferId ?? "");
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not update order";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
