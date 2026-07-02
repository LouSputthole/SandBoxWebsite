import { NextRequest, NextResponse } from "next/server";
import { guardAdminRoute } from "@/lib/auth/admin-guard";
import { deriveLedger, toLedgerCsv } from "@/lib/market/accounting";
import { loadAccountingOrders } from "../../_accounting";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/market/accounting/export
 *
 * The full money ledger as a CSV attachment. Accepts `?key=` (a browser download link can't set an
 * Authorization header — the admin guard already supports the query-param fallback).
 */
export async function GET(request: NextRequest) {
  const guard = await guardAdminRoute(request, { allowedKeys: ["cron", "analytics"] });
  if (!guard.ok) return guard.response;

  const orders = await loadAccountingOrders();
  const csv = toLedgerCsv(deriveLedger(orders));
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="market-ledger-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
