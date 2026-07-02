import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { marketGate } from "@/lib/market/access-server";
import { FundingInProgressError, cancelPendingOrder } from "@/lib/market/order-service";
import { serializeOrder } from "@/lib/market/serialize";

export const dynamic = "force-dynamic";

/**
 * GET /api/market/orders/[id] — order status, visible only to its buyer or seller. Returns a
 * hand-picked DTO: never leak the counterparty's `buyerPriorAssetIds`, the audit-only
 * `tradeAttempts.evidence`, or escrow internals (escrowPda/onchainOrderId).
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await marketGate();
  if (gate) return gate;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { id } = await params;
  const order = await prisma.marketOrder.findUnique({
    where: { id },
    select: {
      id: true,
      buyerId: true,
      sellerId: true,
      state: true,
      priceUsdc: true,
      feeBps: true,
      deliveryDeadline: true,
      protectionUntil: true,
      fundedAt: true,
      sellerSentAt: true,
      deliveredAt: true,
      protectionStartedAt: true,
      releasedAt: true,
      refundedAt: true,
      disputeReason: true,
      listing: {
        select: {
          id: true,
          priceUsd: true,
          item: { select: { name: true, slug: true, imageUrl: true, type: true, rarityColor: true } },
        },
      },
    },
  });
  if (!order || (order.buyerId !== user.id && order.sellerId !== user.id)) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const { buyerId, sellerId, priceUsdc, ...rest } = order;
  void buyerId; // destructured only to exclude it from the response
  return NextResponse.json({
    order: { ...rest, priceUsdc: priceUsdc.toString(), role: sellerId === user.id ? "seller" : "buyer" },
  });
}

/**
 * DELETE /api/market/orders/[id] — buyer cancels a PENDING order (rejected the wallet signature).
 * Buyer-only (404 for anyone else — don't leak existence). 200 { cancelled: true } when nothing
 * funded; if the order turned out funded on-chain (or a concurrent fund call settled it first) it is
 * returned as { cancelled: false, order } — the purchase went through. 409s:
 *  - the order is FUNDING (a fund call is confirming the buyer's tx on-chain RIGHT NOW) — the
 *    purchase is in flight and cannot be cancelled;
 *  - any other non-PENDING state — too late to cancel.
 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await marketGate();
  if (gate) return gate;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { id } = await params;
  try {
    const result = await cancelPendingOrder(id, user.id);
    if (result.cancelled) return NextResponse.json({ cancelled: true });
    // The order was actually funded — return it so the client treats the purchase as gone through.
    return NextResponse.json({ cancelled: false, order: serializeOrder(result.order) });
  } catch (err) {
    if (err instanceof Error && err.message === "order not found") {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    if (err instanceof FundingInProgressError) {
      return NextResponse.json(
        { error: "Your purchase is being confirmed on-chain — it can no longer be cancelled" },
        { status: 409 },
      );
    }
    if (err instanceof Error && err.message === "order is not pending") {
      return NextResponse.json({ error: "Order can no longer be cancelled" }, { status: 409 });
    }
    const message = err instanceof Error ? err.message : "Could not cancel order";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
