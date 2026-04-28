import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { transition } from "@/lib/escrow/state-machine";
import {
  paymentDeadlineFrom,
} from "@/lib/escrow/state-machine";
import type { EscrowState } from "@/lib/escrow/state-machine";

/**
 * POST /api/escrow/bot/mark
 *
 * The bot worker reports trade-offer results back here. Body:
 *   {
 *     tradeId: string,
 *     action: "deposit_sent" | "deposit_accepted" | "deposit_failed"
 *           | "release_sent" | "release_accepted" | "release_failed"
 *           | "refund_sent",
 *     steamOfferId?: string,
 *     reason?: string  // for *_failed
 *   }
 *
 * Auth via BOT_API_KEY (same as work-queue). All actions are
 * idempotent — calling deposit_accepted twice on the same trade is a
 * no-op (state machine rejects the second).
 */

function authorized(request: NextRequest): boolean {
  const expected = process.env.BOT_API_KEY;
  if (!expected) return false;
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${expected}`;
}

interface Body {
  tradeId?: string;
  action?: string;
  steamOfferId?: string;
  reason?: string;
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { tradeId, action } = body;
  if (!tradeId || !action) {
    return NextResponse.json(
      { error: "tradeId + action required" },
      { status: 400 },
    );
  }

  const trade = await prisma.escrowTrade.findUnique({ where: { id: tradeId } });
  if (!trade) {
    return NextResponse.json({ error: "Trade not found" }, { status: 404 });
  }

  const now = new Date();

  switch (action) {
    case "deposit_sent": {
      // Bot put a trade offer in seller's inbox; track the id so
      // support can link it. State stays pending_deposit until seller
      // accepts (then we transition on `deposit_accepted`).
      await prisma.escrowTrade.update({
        where: { id: trade.id },
        data: { depositTradeOfferId: body.steamOfferId ?? null },
      });
      return NextResponse.json({ ok: true });
    }
    case "deposit_accepted": {
      const next = transition(trade.state as EscrowState, {
        kind: "seller_deposited",
      });
      if (!next.ok || !next.nextState) {
        return NextResponse.json(
          { error: next.error ?? "Invalid transition" },
          { status: 409 },
        );
      }
      await prisma.escrowTrade.update({
        where: { id: trade.id },
        data: {
          state: next.nextState,
          depositedAt: now,
          // Buyer payment clock starts now.
          paymentDeadline: paymentDeadlineFrom(now),
        },
      });
      return NextResponse.json({ ok: true, state: next.nextState });
    }
    case "deposit_failed": {
      // Seller declined or didn't accept in time. Cancel the trade.
      const next = transition(trade.state as EscrowState, {
        kind: "deposit_timeout",
      });
      if (!next.ok || !next.nextState) {
        return NextResponse.json(
          { error: next.error ?? "Invalid transition" },
          { status: 409 },
        );
      }
      await prisma.escrowTrade.update({
        where: { id: trade.id },
        data: { state: next.nextState, cancelledAt: now },
      });
      return NextResponse.json({ ok: true, state: next.nextState });
    }
    case "release_sent": {
      await prisma.escrowTrade.update({
        where: { id: trade.id },
        data: {
          releaseTradeOfferId: body.steamOfferId ?? null,
          releasedAt: now,
        },
      });
      return NextResponse.json({ ok: true });
    }
    case "release_accepted": {
      const next = transition(trade.state as EscrowState, {
        kind: "buyer_received",
      });
      if (!next.ok || !next.nextState) {
        return NextResponse.json(
          { error: next.error ?? "Invalid transition" },
          { status: 409 },
        );
      }
      await prisma.escrowTrade.update({
        where: { id: trade.id },
        data: { state: next.nextState, completedAt: now },
      });
      return NextResponse.json({ ok: true, state: next.nextState });
    }
    case "release_failed": {
      const next = transition(trade.state as EscrowState, {
        kind: "bot_release_failed",
        reason: body.reason ?? "unknown",
      });
      if (!next.ok || !next.nextState) {
        return NextResponse.json(
          { error: next.error ?? "Invalid transition" },
          { status: 409 },
        );
      }
      await prisma.$transaction([
        prisma.escrowTrade.update({
          where: { id: trade.id },
          data: { state: next.nextState, disputedAt: now },
        }),
        prisma.dispute.upsert({
          where: { tradeId: trade.id },
          create: {
            tradeId: trade.id,
            openedBy: "system",
            reason: `Bot release failed: ${body.reason ?? "unknown"}`,
          },
          update: {},
        }),
      ]);
      return NextResponse.json({ ok: true, state: next.nextState });
    }
    case "refund_sent": {
      await prisma.escrowTrade.update({
        where: { id: trade.id },
        data: { refundTradeOfferId: body.steamOfferId ?? null },
      });
      return NextResponse.json({ ok: true });
    }
    default:
      return NextResponse.json(
        { error: `Unknown action ${action}` },
        { status: 400 },
      );
  }
}
