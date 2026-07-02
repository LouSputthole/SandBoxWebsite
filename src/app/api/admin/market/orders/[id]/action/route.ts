import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guardAdminRoute } from "@/lib/auth/admin-guard";
import { getEscrowClient } from "@/lib/market/escrow";
import { resolveDispute, tickOrder } from "@/lib/market/order-service";
import { ORDER_INCLUDE, serializeOrder } from "../../../_serialize";

export const dynamic = "force-dynamic";

type Action = "freeze" | "resolve_release" | "resolve_refund" | "tick";
const ACTIONS: ReadonlySet<string> = new Set(["freeze", "resolve_release", "resolve_refund", "tick"]);

/**
 * POST /api/admin/market/orders/[id]/action
 * Body: { action: "freeze" | "resolve_release" | "resolve_refund" | "tick", reason?: string }
 *
 * Operator orchestration over the existing money machinery — this route never reimplements money
 * logic, it only calls into order-service / the escrow client:
 *  - freeze          FUNDED|PROTECTION_HOLD → escrow.freeze + mark DISPUTED (reason required); mirrors
 *                    order-service.openDispute's transition (minus the buyer/seller ownership check).
 *  - resolve_release / resolve_refund → resolveDispute (which enforces the order is DISPUTED).
 *  - tick            → tickOrder(id, buyer.steamId): the oracle correlate + advance for one order.
 *
 * Always returns the refreshed order. Domain errors surface as 400 with the thrown message.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardAdminRoute(request, { allowedKeys: ["cron", "analytics"] });
  if (!guard.ok) return guard.response;

  const { id } = await params;

  let body: { action?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const action = body.action;
  if (!action || !ACTIONS.has(action)) {
    return NextResponse.json(
      { error: "action must be one of: freeze, resolve_release, resolve_refund, tick" },
      { status: 400 },
    );
  }

  const order = await prisma.marketOrder.findUnique({
    where: { id },
    include: { buyer: { select: { steamId: true } } },
  });
  if (!order) return NextResponse.json({ error: "order not found" }, { status: 404 });

  try {
    let actionTaken: string = action;
    switch (action as Action) {
      case "freeze": {
        const reason = body.reason?.trim();
        if (!reason) throw new Error("a reason is required to freeze an order");
        if (order.state !== "FUNDED" && order.state !== "PROTECTION_HOLD") {
          throw new Error(`cannot freeze an order in state ${order.state} (needs FUNDED or PROTECTION_HOLD)`);
        }
        // Same transition order-service uses (openDispute): freeze the escrow, then mark DISPUTED.
        await getEscrowClient().freeze(id, reason);
        await prisma.marketOrder.update({ where: { id }, data: { state: "DISPUTED", disputeReason: reason } });
        break;
      }
      case "resolve_release":
        await resolveDispute(id, "release");
        break;
      case "resolve_refund":
        await resolveDispute(id, "refund");
        break;
      case "tick": {
        // Guard the oracle's input: an empty/missing buyer steamId would feed garbage to the Steam
        // inventory fetch. Surfaces as 400 via the catch below.
        if (!order.buyer?.steamId) {
          throw new Error("order buyer has no Steam id on file — cannot run an oracle tick");
        }
        const result = await tickOrder(id, order.buyer.steamId);
        actionTaken = `tick:${result.action}`;
        break;
      }
    }

    const refreshed = await prisma.marketOrder.findUnique({ where: { id }, include: ORDER_INCLUDE });
    if (!refreshed) return NextResponse.json({ error: "order vanished after action" }, { status: 404 });
    return NextResponse.json({ actionTaken, order: serializeOrder(refreshed) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "action failed" },
      { status: 400 },
    );
  }
}
