"use client";

import * as React from "react";
import {
  AreaChart as RechartsAreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { cn } from "@/lib/utils";

/**
 * Arcade price/market area chart. Accent stroke over a soft gradient fill
 * (color → transparent), a faint horizontal grid, mono tick labels, and a
 * panel+hairline tooltip. Plain data in, no fetching.
 *
 * Two ways to use it:
 *   <AreaChart series={...} />                      — the pure chart, standalone
 *   <AreaChartCard title=… series=… onTimeframe=… />— carded with header + toggle
 *
 * Pass `color` to recolor for movers (e.g. "var(--up)" / "var(--down)").
 */

export interface AreaPoint {
  /** X value — a label, ISO string, or epoch. */
  t: string | number;
  /** Y value. */
  v: number;
}

export type Timeframe = "24H" | "7D" | "30D" | "90D" | "ALL";
export const TIMEFRAMES: Timeframe[] = ["24H", "7D", "30D", "90D", "ALL"];

export interface AreaChartProps {
  series: AreaPoint[];
  /** Stroke + gradient color. Defaults to the brand accent. */
  color?: string;
  /** Chart height in px (responsive width). */
  height?: number;
  /** Faint horizontal gridlines. */
  grid?: boolean;
  /** Show the X axis with mono tick labels. */
  xAxis?: boolean;
  /** Show the Y axis with mono tick labels. */
  yAxis?: boolean;
  /** Formats the value in the tooltip (and Y ticks when shown). */
  valueFormatter?: (v: number) => string;
  /** Formats the label in the tooltip (and X ticks when shown). */
  labelFormatter?: (t: string | number) => string;
  className?: string;
}

interface TooltipPayloadItem {
  value?: number | string;
  payload?: AreaPoint;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string | number;
  valueFormatter?: (v: number) => string;
  labelFormatter?: (t: string | number) => string;
}

/** Panel + hairline tooltip with mono numerics, matching the mockups. */
function ChartTooltip({
  active,
  payload,
  label,
  valueFormatter,
  labelFormatter,
}: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const raw = payload[0]?.value;
  const v = typeof raw === "number" ? raw : Number(raw);
  return (
    <div
      className="rounded-[10px] border border-line bg-panel px-[11px] py-2 shadow-[0_12px_30px_-12px_rgba(0,0,0,.7)]"
    >
      {label !== undefined && label !== "" && (
        <div className="font-mono text-[11px] text-faint">
          {labelFormatter ? labelFormatter(label) : String(label)}
        </div>
      )}
      <div className="font-mono text-[13px] font-bold text-tx">
        {Number.isFinite(v) ? (valueFormatter ? valueFormatter(v) : v) : "—"}
      </div>
    </div>
  );
}

export function AreaChart({
  series,
  color = "var(--accent)",
  height = 220,
  grid = true,
  xAxis = false,
  yAxis = false,
  valueFormatter,
  labelFormatter,
  className,
}: AreaChartProps) {
  // Unique gradient id so multiple charts on one page don't share a fill.
  const gid = "areaGrad-" + React.useId().replace(/:/g, "");

  return (
    <div className={className} style={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        <RechartsAreaChart
          data={series}
          margin={{ top: 6, right: 6, bottom: 0, left: 0 }}
        >
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.32} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          {grid && (
            <CartesianGrid
              vertical={false}
              stroke="var(--line)"
              strokeOpacity={0.6}
              strokeDasharray="3 3"
            />
          )}
          <XAxis
            dataKey="t"
            hide={!xAxis}
            tick={{
              fill: "var(--faint)",
              fontSize: 11,
              fontFamily: "var(--font-mono)",
            }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            minTickGap={36}
            tickFormatter={
              labelFormatter ? (value) => labelFormatter(value) : undefined
            }
          />
          <YAxis
            hide={!yAxis}
            tick={{
              fill: "var(--faint)",
              fontSize: 11,
              fontFamily: "var(--font-mono)",
            }}
            tickLine={false}
            axisLine={false}
            width={52}
            domain={["auto", "auto"]}
            tickFormatter={
              valueFormatter ? (value) => valueFormatter(Number(value)) : undefined
            }
          />
          <Tooltip
            cursor={{ stroke: "var(--line)", strokeWidth: 1 }}
            content={
              <ChartTooltip
                valueFormatter={valueFormatter}
                labelFormatter={labelFormatter}
              />
            }
          />
          <Area
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill={`url(#${gid})`}
            dot={false}
            activeDot={{ r: 3.5, stroke: "var(--panel)", strokeWidth: 2, fill: color }}
            isAnimationActive={false}
          />
        </RechartsAreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export interface TimeframeToggleProps {
  value: Timeframe;
  /** Which timeframes to offer. Defaults to all five. */
  timeframes?: Timeframe[];
  onChange: (tf: Timeframe) => void;
  className?: string;
}

/** Segmented 24H · 7D · 30D · 90D · ALL toggle (mono, accent-filled active). */
export function TimeframeToggle({
  value,
  timeframes = TIMEFRAMES,
  onChange,
  className,
}: TimeframeToggleProps) {
  return (
    <div className={cn("flex gap-1.5", className)}>
      {timeframes.map((tf) => {
        const active = tf === value;
        return (
          <button
            key={tf}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(tf)}
            className={cn(
              "rounded-[9px] border px-3 py-1.5 font-mono text-[12px] font-bold transition-colors",
              active
                ? "border-accent bg-accent text-white"
                : "border-line bg-transparent text-mut hover:text-tx"
            )}
          >
            {tf}
          </button>
        );
      })}
    </div>
  );
}

export interface AreaChartCardProps extends AreaChartProps {
  /** Card heading (display font). */
  title?: React.ReactNode;
  /** Sub-label under the title (faint). */
  subtitle?: React.ReactNode;
  /** Big headline figure shown above the chart (e.g. "$3,547,651"). */
  value?: React.ReactNode;
  /** Delta string shown by the title, e.g. "▲ +2.4%". */
  delta?: string;
  /** Force delta color; otherwise inferred from a leading − / ▼. */
  deltaPositive?: boolean;
  /** Current timeframe — render the toggle by also passing `onTimeframe`. */
  timeframe?: Timeframe;
  timeframes?: Timeframe[];
  onTimeframe?: (tf: Timeframe) => void;
  /** Slot under the chart (e.g. period low / avg / high). */
  footer?: React.ReactNode;
  cardClassName?: string;
}

/**
 * The chart wrapped in an Arcade panel card: title/subtitle, an optional
 * headline value + delta, an optional timeframe toggle in the header, and
 * an optional footer slot. The pure <AreaChart> remains usable on its own.
 */
export function AreaChartCard({
  title,
  subtitle,
  value,
  delta,
  deltaPositive,
  timeframe,
  timeframes,
  onTimeframe,
  footer,
  cardClassName,
  ...chart
}: AreaChartCardProps) {
  const positive =
    deltaPositive ?? (delta ? !/^[-−▼]/.test(delta.trim()) : true);
  const deltaColor = positive ? "var(--up)" : "var(--down)";
  const hasHeader = title || subtitle || delta || onTimeframe;

  return (
    <div
      className={cn(
        "rounded-[18px] border border-line bg-panel p-5",
        cardClassName
      )}
    >
      {hasHeader && (
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title && (
              <h2 className="m-0 font-display text-[18px] font-bold text-tx">
                {title}
              </h2>
            )}
            {subtitle && (
              <div className="mt-0.5 text-[12.5px] text-faint">{subtitle}</div>
            )}
          </div>
          <div className="flex flex-shrink-0 items-center gap-3">
            {delta && (
              <span
                className="font-mono text-[13px] font-bold"
                style={{ color: deltaColor }}
              >
                {delta}
              </span>
            )}
            {onTimeframe && (
              <TimeframeToggle
                value={timeframe ?? (timeframes ?? TIMEFRAMES)[0]}
                timeframes={timeframes}
                onChange={onTimeframe}
              />
            )}
          </div>
        </div>
      )}
      {value !== undefined && (
        <div className="mb-3 font-mono text-[32px] font-bold leading-none tracking-[-1px] text-tx">
          {value}
        </div>
      )}
      <AreaChart {...chart} />
      {footer && (
        <div className="mt-3.5 border-t border-line2 pt-3.5">{footer}</div>
      )}
    </div>
  );
}
