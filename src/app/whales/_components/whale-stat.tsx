import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Compact stat chip for the Whales header row — a muted label over a big
 * Bricolage display figure. Matches the Arcade mockup's stat-chip styling
 * (distinct from the mono StatCard used elsewhere); `accent` tints the
 * value purple for the highlighted metric.
 */
export interface WhaleStatProps {
  label: string;
  value: React.ReactNode;
  /** Tint the figure with the brand purple (used for "Top wallet share"). */
  accent?: boolean;
  className?: string;
}

export function WhaleStat({ label, value, accent, className }: WhaleStatProps) {
  return (
    <div
      className={cn(
        "rounded-[16px] border border-line bg-panel p-[18px]",
        className
      )}
    >
      <div className="mb-[5px] text-[12.5px] text-mut">{label}</div>
      <div
        className={cn(
          "font-display text-[26px] font-extrabold tracking-[-.5px]",
          accent ? "text-accent" : "text-tx"
        )}
      >
        {value}
      </div>
    </div>
  );
}
