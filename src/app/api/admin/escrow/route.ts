import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guardAdminRoute } from "@/lib/auth/admin-guard";
import { transition } from "@/lib/escrow/state-machine";
import type { EscrowState } from "@/lib/escrow/state-machine";

/**
 * GET  /api/admin/escrow            — list trades grouped by state +
 *                                     live counts. Powers /admin/escrow.
 * POST /api/admin/escrow            — admin actions on a trade:
 *   { tradeId, action: "resolve_dispute", resolution, note }
 *   { tradeId, action: "force_cancel", reason }
 */

export async function GET(request: NextRequest) {
  const guard = await guardAdminRoute(request, { allowedKeys: ["analytics"] });
  if (!guard.ok) return guard.response;

  const [open, recent, disputes, bots] = await Promise.all([
    prisma.escrowTrade.findMany({
      where: {
        state: {
          in: ["pending_deposit", "awaiting_payment", "payment_confirmed"],
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        buyer: { select: { username: true, steamId: true } },
        seller: { select: { username: true, steamId: true } },
        botAccount: { select: { label: true } },
      },
    }),
    prisma.escrowTrade.findMany({
      where: {
        state: { in: ["completed", "cancelled", "refunded"] },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: {
        buyer: { select: { username: true } },
        seller: { select: { username: true } },
      },
    }),
    prisma.escrowTrade.findMany({
      where: { state: "disputed" },
      orderBy: { disputedAt: "desc" },
      include: {
        dispute: true,
        buyer: { select: { username: true, steamId: true } },
        seller: { select: { username: true, steamId: true } },
      },
    }),
    prisma.escrowBotAccount.findMany({
      include: {
        _count: {
          select: {
            trades: {
              where: {
                state: {
                  in: [
                    "pending_deposit",
                    "awaiting_payment",
                    "payment_confirmed",
                    "disputed",
                  ],
                },
              },
            },
          },
        },
      },
      orderBy: { id: "asc" },
    }),
  ]);

  return NextResponse.json({ open, recent, disputes, bots });
}

interface AdminBody {
  tradeId?: string;
  action?: string;
  resolution?:
    | "released_to_buyer"
    | "refunded_to_buyer"
    | "returned_to_seller"
    | "rejected";
  note?: string;
  reason?: string;
}

export async function POST(request: NextRequest) {
  const guard = await guardAdminRoute(request, { allowedKeys: ["analytics"] });
  if (!guard.ok) return guard.response;

  let body: AdminBody;
  try {
    body = (await request.json()) as AdminBody;
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

  const trade = await prisma.escrowTrade.findUnique({
    where: { id: tradeId },
  });
  if (!trade) {
    return NextResponse.json({ error: "Trade not found" }, { status: 404 });
  }

  const now = new Date();

  if (action === "resolve_dispute") {
    if (!body.resolution) {
      return NextResponse.json(
        { error: "resolution required" },
        { status: 400 },
      );
    }
    const next = transition(trade.state as EscrowState, {
      kind: "dispute_resolved",
      resolution: body.resolution,
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
        data: {
          state: next.nextState,
          ...(next.nextState === "completed" ? { completedAt: now } : {}),
          ...(next.nextState === "refunded" ? { refundedAt: now } : {}),
          ...(next.nextState === "cancelled" ? { cancelledAt: now } : {}),
        },
      }),
      prisma.dispute.update({
        where: { tradeId: trade.id },
        data: {
          resolution: body.resolution,
          resolutionNote: body.note ?? null,
          resolvedAt: now,
        },
      }),
    ]);
    return NextResponse.json({ ok: true, state: next.nextState });
  }

  if (action === "force_cancel") {
    // Bail-out for stuck trades (rare). Always allowed regardless of
    // current state — admin should be able to nuke anything.
    await prisma.escrowTrade.update({
      where: { id: trade.id },
      data: { state: "cancelled", cancelledAt: now },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json(
    { error: `Unknown action ${action}` },
    { status: 400 },
  );
}
