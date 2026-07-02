import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guardAdminRoute } from "@/lib/auth/admin-guard";
import { getEscrowClient } from "@/lib/market/escrow";
import { ORDER_INCLUDE, serializeOrder } from "../../_serialize";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/market/orders/[id]
 *
 * Full order detail PLUS the live on-chain escrow record. The chain read is best-effort: on an RPC
 * failure we return `chain: null, chainError` so the detail page still renders. `chainMismatch` is
 * true when an escrow EXISTS on-chain but its state disagrees with our DB state (e.g. funding landed
 * but the DB never promoted) — the operator's signal that reconciliation is needed.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardAdminRoute(request, { allowedKeys: ["cron", "analytics"] });
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const order = await prisma.marketOrder.findUnique({ where: { id }, include: ORDER_INCLUDE });
  if (!order) return NextResponse.json({ error: "order not found" }, { status: 404 });

  let chain: Record<string, unknown> | null = null;
  let chainError: string | null = null;
  let chainMismatch = false;
  try {
    const record = await getEscrowClient().get(id);
    if (record) {
      chain = { ...record, amount: record.amount.toString() };
      chainMismatch = record.state !== order.state;
    }
  } catch (err) {
    chainError = err instanceof Error ? err.message : "escrow RPC read failed";
  }

  return NextResponse.json({
    order: serializeOrder(order),
    chain,
    chainError,
    chainMismatch,
  });
}
