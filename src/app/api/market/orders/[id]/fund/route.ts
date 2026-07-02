import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { marketGate } from "@/lib/market/access-server";
import { FundingInProgressError, fundOrder } from "@/lib/market/order-service";
import { serializeOrder } from "@/lib/market/serialize";

export const dynamic = "force-dynamic";

/**
 * POST /api/market/orders/[id]/fund — phase 2 of a purchase. The buyer submits the signed
 * open_escrow transaction; we submit + verify it on-chain and promote the order to FUNDED.
 * Body: { signedTxBase64? } — omit it on the mock/dev path (nothing to sign) or as a reconcile retry.
 *
 * Buyer-only (404 for anyone else — don't leak the order's existence). Idempotent (200 with the
 * serialized order). Two 409 shapes:
 *  - { retry: true, openTx: { txBase64 } } — the signed tx's blockhash expired before landing
 *    (proven not funded); the client signs the FRESH tx and re-posts once.
 *  - { error } — a concurrent fund call is already confirming this order (FundingInProgressError).
 * Solana submit/verify failures surface as 400 with the escrow client's message.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await marketGate();
  if (gate) return gate;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { id } = await params;
  let body: { signedTxBase64?: string } = {};
  try {
    body = await request.json();
  } catch {
    // empty / missing body is valid — the mock/dev path funds with no signed tx
  }
  const signedTxBase64 = typeof body.signedTxBase64 === "string" ? body.signedTxBase64 : null;

  try {
    const result = await fundOrder(id, user.id, signedTxBase64);
    if ("retry" in result) {
      return NextResponse.json({ retry: true, openTx: result.openTx }, { status: 409 });
    }
    return NextResponse.json({ order: serializeOrder(result) });
  } catch (err) {
    // fundOrder throws "order not found" for a missing order OR another user's order → 404, no leak.
    if (err instanceof Error && err.message === "order not found") {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    if (err instanceof FundingInProgressError) {
      return NextResponse.json({ error: "This purchase is already being confirmed" }, { status: 409 });
    }
    const message = err instanceof Error ? err.message : "Could not confirm payment";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
