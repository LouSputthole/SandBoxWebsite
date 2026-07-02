import { NextRequest, NextResponse } from "next/server";
import { guardAdminRoute } from "@/lib/auth/admin-guard";
import { summarize, monthlyBreakdown } from "@/lib/market/accounting";
import { loadAccountingOrders, money } from "../_accounting";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/market/accounting
 *
 * All-time summary + per-month breakdown over every order. USDC bigints are serialized as both raw
 * base units and formatted decimal strings ({ raw, usdc }) so the UI can display without float math.
 */
export async function GET(request: NextRequest) {
  const guard = await guardAdminRoute(request, { allowedKeys: ["cron", "analytics"] });
  if (!guard.ok) return guard.response;

  const orders = await loadAccountingOrders();
  const s = summarize(orders);
  const monthly = monthlyBreakdown(orders);

  return NextResponse.json({
    summary: {
      grossReleasedVolume: money(s.grossReleasedVolume),
      feeRevenue: money(s.feeRevenue),
      refundedVolume: money(s.refundedVolume),
      inEscrowFloat: money(s.inEscrowFloat),
      countsByState: s.countsByState,
      avgTimeToDeliverSeconds: s.avgTimeToDeliverSeconds,
    },
    monthly: monthly.map((m) => ({
      month: m.month,
      releasedVolume: money(m.releasedVolume),
      feeRevenue: money(m.feeRevenue),
      refundedVolume: money(m.refundedVolume),
      releasedCount: m.releasedCount,
      refundedCount: m.refundedCount,
      orderCount: m.orderCount,
    })),
  });
}
