import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { coinbaseCommerce } from "@/lib/escrow/coinbase-commerce";
import { transition } from "@/lib/escrow/state-machine";
import type { Prisma } from "@/generated/prisma";

/**
 * POST /api/escrow/webhooks/coinbase
 *
 * Coinbase Commerce webhook receiver. EVERY request is verified via
 * HMAC against COINBASE_COMMERCE_WEBHOOK_SECRET — failures return 200
 * to avoid leaking signature-detection details to a probing attacker
 * (Coinbase doesn't retry on 4xx in a useful way), and silently log
 * them.
 *
 * Idempotency: each event has a stable id we dedupe on by checking
 * Payment.webhookEvents before applying changes. Webhooks can arrive
 * multiple times for the same event under retries; double-applying
 * a state transition would bend the trade lifecycle.
 *
 * IMPORTANT: this route reads request.text() (raw body) instead of
 * .json() so the HMAC signature stays verifiable. Any reformatting
 * breaks the hash.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const sig = request.headers.get("x-cc-webhook-signature");

  const event = coinbaseCommerce.verifyWebhook(rawBody, sig);
  if (!event) {
    // Don't leak whether the signature was bad vs. body was malformed
    // vs. our secret was missing — return 200 so a probing attacker
    // gets no signal.
    console.warn("[escrow:webhook] coinbase webhook rejected (verify failed)");
    return NextResponse.json({ ok: true });
  }

  // Lookup the Payment row by processorChargeId, then drive the trade
  // state machine if the event indicates settlement.
  const payment = await prisma.payment.findUnique({
    where: { processorChargeId: event.processorChargeId },
    include: { trade: true },
  });
  if (!payment) {
    console.warn(
      `[escrow:webhook] no Payment for charge ${event.processorChargeId}; ignoring ${event.type}`,
    );
    return NextResponse.json({ ok: true });
  }

  // Dedupe — if we've already seen this event id, append nothing and
  // return success.
  const existing = (payment.webhookEvents as { eventId?: string }[]) ?? [];
  if (existing.some((e) => e.eventId === event.eventId)) {
    return NextResponse.json({ ok: true, deduped: true });
  }

  // Append the event. Type assertion required because Prisma's Json
  // type erases the narrower shape we know we're storing.
  const newEvents: Prisma.JsonArray = [
    ...(existing as unknown as Prisma.JsonArray),
    {
      eventId: event.eventId,
      type: event.type,
      timestamp: new Date().toISOString(),
      raw: event.raw as Prisma.JsonValue,
    },
  ];

  // Update Payment + EscrowTrade atomically. If the event signals a
  // settled state we drive the corresponding state machine event.
  await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: event.status,
        amountSettled: event.amountSettled,
        currencySettled: event.currencySettled,
        webhookEvents: newEvents,
        ...(event.status === "confirmed" || event.status === "resolved"
          ? { paidAt: new Date() }
          : {}),
      },
    });

    if (event.status === "confirmed" || event.status === "resolved") {
      const next = transition(
        payment.trade.state as
          | "pending_deposit"
          | "awaiting_payment"
          | "payment_confirmed"
          | "completed"
          | "disputed"
          | "refunded"
          | "cancelled",
        { kind: "payment_confirmed" },
      );
      if (next.ok && next.nextState) {
        await tx.escrowTrade.update({
          where: { id: payment.tradeId },
          data: {
            state: next.nextState,
            paidAt: new Date(),
          },
        });
      } else {
        // Most common reason: trade was already cancelled before
        // payment cleared (e.g. seller didn't deposit in time and the
        // buyer paid late). The bot worker handles refund logic when
        // it sees a cancelled trade with a settled Payment.
        console.warn(
          `[escrow:webhook] trade ${payment.tradeId} not transitioning on payment_confirmed: ${next.error}`,
        );
      }
    } else if (event.status === "expired" || event.status === "failed") {
      // Buyer didn't pay or paid wrong amount; trade goes to disputed
      // (admin reviews — sometimes refunds are owed for partial pays).
      const next = transition(
        payment.trade.state as
          | "pending_deposit"
          | "awaiting_payment"
          | "payment_confirmed"
          | "completed"
          | "disputed"
          | "refunded"
          | "cancelled",
        {
          kind: "complaint_filed",
          openedBy: "system",
          reason: `Payment ${event.status}`,
        },
      );
      if (next.ok && next.nextState) {
        await tx.escrowTrade.update({
          where: { id: payment.tradeId },
          data: {
            state: next.nextState,
            disputedAt: new Date(),
          },
        });
        await tx.dispute.upsert({
          where: { tradeId: payment.tradeId },
          create: {
            tradeId: payment.tradeId,
            openedBy: "system",
            reason: `Coinbase Commerce reported payment ${event.status} on ${event.type}`,
          },
          update: {},
        });
      }
    }
  });

  return NextResponse.json({ ok: true });
}
