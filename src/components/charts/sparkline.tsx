"use client";

import { LineChart, Line } from "recharts";
import { cn } from "@/lib/utils";

/**
 * Tiny inline trend line for table rows and KPI cards. No axes, grid,
 * tooltip, or dots — just a single smoothed stroke sized to fit its slot.
 *
 * Color is derived from the net change (last vs. first point): green
 * `--up` when the series ends at or above where it started, red `--down`
 * otherwise. Pass an explicit `color` to override (e.g. to match a delta
 * chip's direction regardless of the raw series shape).
 *
 * Fixed width/height (no ResponsiveContainer) so it stays cheap when
 * rendered dozens of times down a leaderboard.
 */

export interface SparklineProps {
  /** Raw value series in time order. Needs ≥ 2 points to draw. */
  data: number[];
  /** Pixel width of the sparkline. */
  width?: number;
  /** Pixel height of the sparkline. */
  height?: number;
  /** Explicit stroke color. Defaults to up/down based on net change. */
  color?: string;
  /** Stroke width. */
  strokeWidth?: number;
  className?: string;
}

export function Sparkline({
  data,
  width = 64,
  height = 22,
  color,
  strokeWidth = 1.6,
  className,
}: SparklineProps) {
  // Nothing meaningful to draw — reserve the slot so layouts don't jump.
  if (!data || data.length < 2) {
    return (
      <div
        className={className}
        style={{ width, height }}
        aria-hidden="true"
      />
    );
  }

  const positive = data[data.length - 1] >= data[0];
  const stroke = color ?? (positive ? "var(--up)" : "var(--down)");
  const chartData = data.map((v, i) => ({ i, v }));

  return (
    <div className={cn("shrink-0", className)} style={{ width, height }}>
      <LineChart
        width={width}
        height={height}
        data={chartData}
        margin={{ top: 2, right: 2, bottom: 2, left: 2 }}
      >
        <Line
          type="monotone"
          dataKey="v"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </div>
  );
}
