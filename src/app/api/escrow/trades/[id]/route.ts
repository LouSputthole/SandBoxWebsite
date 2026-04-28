import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { isEscrowEnabled } from "@/lib/escrow/config";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/escrow/trades/[id] — return the trade as either side sees
 * it. Buyer or seller of the trade can read; admin (ANALYTICS_KEY)
 * can read any. Returns enough state for the buyer's hosted-checkout
 * resume + the seller's "deposit pending" view.
 */
export async function GET(request: NextRequest, ctx: RouteContext) {
  if (!isEscrowEnabled()) {
    return NextResponse.json(
      { error: "Escrow is not enabled on this deployment." },
      { status: 503 },
    );
  }

  const { id } = await ctx.params;
  const adminKey = process.env.ANALYTICS_KEY;
  const auth = request.headers.get("authorization");
  const isAdmin = !!adminKey && auth === `Bearer ${adminKey}`;

  const user = isAdmin ? null : await getCurrentUser();
  if (!isAdmin && !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const trade = await prisma.escrowTrade.findUnique({
    where: { id },
    include: {
      payment: {
        select: {
          processor: true,
          status: true,
          hostedUrl: true,
          amountSettled: true,
          currencySettled: true,
          paidAt: true,
        },
      },
      dispute: {
        select: {
          openedBy: true,
          reason: true,
          resolution: true,
          resolutionNote: true,
          createdAt: true,
          resolvedAt: true,
        },
      },
      botAccount: {
        select: { label: true, status: true },
      },
    },
  });

  if (!trade) {
    return NextResponse.json({ error: "Trade not found" }, { status: 404 });
  }

  if (!isAdmin && user && trade.buyerId !== user.id && trade.sellerId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    trade: {
      ...trade,
      createdAt: trade.createdAt.toISOString(),
      depositedAt: trade.depositedAt?.toISOString() ?? null,
      paidAt: trade.paidAt?.toISOString() ?? null,
      releasedAt: trade.releasedAt?.toISOString() ?? null,
      completedAt: trade.completedAt?.toISOString() ?? null,
      disputedAt: trade.disputedAt?.toISOString() ?? null,
      refundedAt: trade.refundedAt?.toISOString() ?? null,
      cancelledAt: trade.cancelledAt?.toISOString() ?? null,
      depositDeadline: trade.depositDeadline.toISOString(),
      paymentDeadline: trade.paymentDeadline?.toISOString() ?? null,
    },
  });
}
