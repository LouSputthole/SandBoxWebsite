"use client";

import { Download } from "lucide-react";
import type { AccountingResponse } from "./types";

/** Seconds → a compact human duration for the "avg time to deliver" stat. */
function humanizeSeconds(s: number | null): string {
  if (s == null) return "—";
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${(s / 3600).toFixed(1)}h`;
  return `${(s / 86400).toFixed(1)}d`;
}

export function AccountingSection({
  data,
  apiKey,
}: {
  data: AccountingResponse | null;
  apiKey: string;
}) {
  if (!data) return null;
  const { monthly, summary } = data;

  return (
    <div className="rounded-xl border border-line bg-panel">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-tx">Accounting</h2>
          <p className="text-xs text-faint">
            Avg time to deliver: {humanizeSeconds(summary.avgTimeToDeliverSeconds)}
          </p>
        </div>
        <a
          href={`/api/admin/market/accounting/export?key=${encodeURIComponent(apiKey)}`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-tx hover:border-accent"
        >
          <Download className="h-3.5 w-3.5" /> Download ledger CSV
        </a>
      </div>

      {monthly.length === 0 ? (
        <p className="p-4 text-sm text-faint">No settled orders yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-[10px] uppercase tracking-wider text-faint">
                <th className="px-4 py-2.5 text-left font-medium">Month</th>
                <th className="px-4 py-2.5 text-right font-medium">Released</th>
                <th className="px-4 py-2.5 text-right font-medium">Fees</th>
                <th className="px-4 py-2.5 text-right font-medium">Refunds</th>
                <th className="px-4 py-2.5 text-right font-medium">Orders</th>
              </tr>
            </thead>
            <tbody>
              {monthly.map((m) => (
                <tr key={m.month} className="border-b border-line/60 last:border-0">
                  <td className="px-4 py-2.5 font-mono text-xs text-tx">{m.month}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-tx">${m.releasedVolume.usdc}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-accent">${m.feeRevenue.usdc}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-mut">${m.refundedVolume.usdc}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-mut">
                    {m.orderCount}
                    <span className="ml-1 text-faint">
                      ({m.releasedCount}✓/{m.refundedCount}↩)
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
