import * as React from "react";
import { cn } from "@/lib/utils";
import { Sparkline } from "@/components/charts/sparkline";

/**
 * Compact stat / KPI panel: a mono uppercase eyebrow, a big mono value, an
 * optional up/down delta chip, and an optional sparkline. Used by Home stat
 * chips, Trends KPIs, and Inventory/Watchlist summaries.
 *
 * Exported as both `StatCard` and `KpiCard` (same component).
 */

export interface StatCardProps {
  /** Eyebrow label — rendered uppercase. */
  label: string;
  /** The headline figure (pre-formatted string or node). */
  value: React.ReactNode;
  /** Delta text, e.g. "+2.4%" or "−1.1%". */
  delta?: string;
  /** Force delta/spark color; otherwise inferred from a leading − / ▼. */
  deltaPositive?: boolean;
  /** Optional trend series for the inline sparkline. */
  spark?: number[];
  className?: string;
}

export function StatCard({
  label,
  value,
  delta,
  deltaPositive,
  spark,
  className,
}: StatCardProps) {
  const positive =
    deltaPositive ?? (delta ? !/^[-−▼]/.test(delta.trim()) : true);
  const color = positive ? "var(--up)" : "var(--down)";
  const arrow = positive ? "▲" : "▼";

  return (
    <div
      className={cn(
        "rounded-[18px] border border-line bg-panel p-[18px]",
        className
      )}
    >
      <div className="mb-2 font-mono text-[11px] uppercase tracking-[.5px] text-faint">
        {label}
      </div>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-[25px] font-bold leading-none tracking-[-.5px] text-tx">
            {value}
          </div>
          {delta && (
            <div
              className="mt-1.5 font-mono text-[12px] font-bold"
              style={{ color }}
            >
              {arrow} {delta}
            </div>
          )}
        </div>
        {spark && spark.length > 1 && (
          <Sparkline data={spark} color={color} width={70} height={28} />
        )}
      </div>
    </div>
  );
}

export { StatCard as KpiCard };
