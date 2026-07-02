import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { marketGate } from "@/lib/market/access-server";
import { openDispute } from "@/lib/market/order-service";

export const dynamic = "force-dynamic";

/** POST /api/market/orders/[id]/dispute — buyer or seller contests the order. Body: { reason }. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await marketGate();
  if (gate) return gate;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { id } = await params;
  let body: { reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const reason = body.reason?.trim();
  if (!reason) return NextResponse.json({ error: "A reason is required" }, { status: 400 });

  try {
    await openDispute(id, user.id, reason.slice(0, 500));
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not open dispute";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
