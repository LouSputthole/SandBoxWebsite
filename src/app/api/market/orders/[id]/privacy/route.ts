import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { marketGate } from "@/lib/market/access-server";
import { setOrderPartyPublic } from "@/lib/market/order-service";

export const dynamic = "force-dynamic";

/**
 * POST /api/market/orders/[id]/privacy — a party toggles whether their Steam identity appears on the
 * public trust ledger. Body: { public: boolean }. Authed; the party (buyer vs seller) is inferred
 * from the session — a non-party gets 404 (same as a missing order, no existence leak). Allowed in
 * any lifecycle state. Returns { role, buyerPublic, sellerPublic }.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await marketGate();
  if (gate) return gate;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { id } = await params;
  let body: { public?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof body.public !== "boolean") {
    return NextResponse.json({ error: "`public` must be a boolean" }, { status: 400 });
  }

  try {
    const result = await setOrderPartyPublic(id, user.id, body.public);
    return NextResponse.json(result);
  } catch (err) {
    // "order not found" covers both a missing order and a non-party — 404, no existence leak.
    if (err instanceof Error && err.message === "order not found") {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    const message = err instanceof Error ? err.message : "Could not update visibility";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
