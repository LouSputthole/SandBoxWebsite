import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * GET /api/escrow/bot/work-queue?botId=...
 *
 * Polled by the off-Vercel bot worker (Railway/Fly/wherever) to find
 * trades that need bot action. Auth via BOT_API_KEY shared secret —
 * the bot worker holds a copy in its env, we hold one server-side.
 *
 * Returns trades grouped by required action so the worker can batch:
 *   - sendDeposit: trades in pending_deposit assigned to this bot,
 *     deposit deadline not yet passed. Worker sends a Steam trade
 *     offer to seller asking for the items.
 *   - sendRelease: trades in payment_confirmed assigned to this bot.
 *     Worker sends a Steam trade offer to buyer with the items.
 *   - sendRefund: trades in cancelled where buyer paid but item still
 *     in bot inventory (rare; happens when payment clears post-
 *     deposit-timeout). Worker returns item to seller.
 *
 * The worker reports back via mark-deposit / mark-released /
 * mark-failed below.
 */

function authorized(request: NextRequest): boolean {
  const expected = process.env.BOT_API_KEY;
  if (!expected) return false;
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${expected}`;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const botId = request.nextUrl.searchParams.get("botId");
  if (!botId) {
    return NextResponse.json({ error: "botId required" }, { status: 400 });
  }

  const now = new Date();
  const [sendDeposit, sendRelease, sendRefund] = await Promise.all([
    prisma.escrowTrade.findMany({
      where: {
        botAccountId: botId,
        state: "pending_deposit",
        depositDeadline: { gt: now },
        depositTradeOfferId: null,
      },
      include: {
        seller: {
          select: { steamId: true, steamTradeUrl: true, username: true },
        },
      },
      orderBy: { createdAt: "asc" },
      take: 10,
    }),
    prisma.escrowTrade.findMany({
      where: {
        botAccountId: botId,
        state: "payment_confirmed",
        releaseTradeOfferId: null,
      },
      include: {
        buyer: {
          select: { steamId: true, steamTradeUrl: true, username: true },
        },
      },
      orderBy: { createdAt: "asc" },
      take: 10,
    }),
    prisma.escrowTrade.findMany({
      where: {
        botAccountId: botId,
        state: "cancelled",
        depositTradeOfferId: { not: null }, // we received the item
        refundTradeOfferId: null, // but haven't returned it
      },
      include: {
        seller: {
          select: { steamId: true, steamTradeUrl: true, username: true },
        },
      },
      orderBy: { cancelledAt: "asc" },
      take: 10,
    }),
  ]);

  return NextResponse.json({
    sendDeposit: sendDeposit.map((t) => ({
      tradeId: t.id,
      itemSnapshot: t.itemSnapshot,
      seller: t.seller,
      depositDeadline: t.depositDeadline.toISOString(),
    })),
    sendRelease: sendRelease.map((t) => ({
      tradeId: t.id,
      itemSnapshot: t.itemSnapshot,
      buyer: t.buyer,
    })),
    sendRefund: sendRefund.map((t) => ({
      tradeId: t.id,
      itemSnapshot: t.itemSnapshot,
      seller: t.seller,
    })),
  });
}
