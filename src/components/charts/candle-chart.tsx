"use client";

import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Bar,
  BarChart,
  Cell,
} from "recharts";
import type { Candle } from "@/lib/trends/candles";

/**
 * Arcade candlestick (OHLC) chart. Two passes through a Recharts BarChart:
 *   1. Wick   — `dataKey="lowHigh"`, a 1px bar drawn first (low → high).
 *   2. Body   — `dataKey="openClose"`, a wider bar (open ↔ close).
 *
 * Recharts honors a 2-tuple dataKey by drawing the bar between the two values
 * along the Y axis — exactly what a candle's wick + body need. Per-candle
 * color (green up / red down / faint flat) comes from <Cell> children using
 * the foundation `--up` / `--down` / `--faint` tokens. Green/red here is the
 * sanctioned price-signal use of those colors.
 *
 * The Y domain is clamped to the candle min/max (Recharts otherwise starts at
 * 0, which crushes a chart whose values move only single-digit % over the
 * window — e.g. total market cap — into flat dashes at the top).
 */

const UP_COLOR = "var(--up)";
const DOWN_COLOR = "var(--down)";
const FLAT_COLOR = "var(--faint)";

export interface CandleChartProps {
  data: Candle[];
  /** Chart height in px (responsive width). */
  height?: number;
  /** Formats values in the tooltip + Y ticks. */
  valueFormatter?: (v: number) => string;
}

interface CandleTooltipPayload {
  payload: Candle;
}

interface CandleTooltipProps {
  active?: boolean;
  payload?: CandleTooltipPayload[];
  valueFormatter?: (v: number) => string;
}

/** Panel + hairline OHLC tooltip with mono numerics, matching the area chart. */
function CandleTooltip({
  active,
  payload,
  valueFormatter = (v) => String(v),
}: CandleTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const c = payload[0].payload;
  const change = c.open > 0 ? ((c.close - c.open) / c.open) * 100 : 0;
  const changeColor = change >= 0 ? "var(--up)" : "var(--down)";
  return (
    <div className="rounded-[10px] border border-line bg-panel px-[11px] py-2 shadow-[0_12px_30px_-12px_rgba(0,0,0,.7)]">
      <div className="mb-1 font-mono text-[11px] text-faint">{c.label}</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 font-mono text-[12px]">
        <span className="text-faint">O</span>
        <span className="text-right tabular-nums text-tx">
          {valueFormatter(c.open)}
        </span>
        <span className="text-faint">H</span>
        <span className="text-right tabular-nums text-up">
          {valueFormatter(c.high)}
        </span>
        <span className="text-faint">L</span>
        <span className="text-right tabular-nums text-down">
          {valueFormatter(c.low)}
        </span>
        <span className="text-faint">C</span>
        <span className="text-right tabular-nums text-tx">
          {valueFormatter(c.close)}
        </span>
        <span className="text-faint">Δ</span>
        <span
          className="text-right font-bold tabular-nums"
          style={{ color: changeColor }}
        >
          {change >= 0 ? "+" : ""}
          {change.toFixed(2)}%
        </span>
      </div>
    </div>
  );
}

function colorFor(direction: Candle["direction"]): string {
  return direction === "up"
    ? UP_COLOR
    : direction === "down"
      ? DOWN_COLOR
      : FLAT_COLOR;
}

export function CandleChart({
  data,
  height = 300,
  valueFormatter = (v) => String(v),
}: CandleChartProps) {
  // Pad the Y domain by 5% of the range on each side so candles don't kiss
  // the chart edges. Empty data → a harmless [0, 1] fallback.
  const allValues = data.flatMap((c) => [c.low, c.high]);
  const min = allValues.length > 0 ? Math.min(...allValues) : 0;
  const max = allValues.length > 0 ? Math.max(...allValues) : 1;
  const pad = (max - min) * 0.05;
  const yDomain: [number, number] = [Math.max(0, min - pad), max + pad];

  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 8, right: 6, left: 0, bottom: 0 }}
          barCategoryGap="20%"
        >
          <XAxis
            dataKey="label"
            tick={{
              fill: "var(--faint)",
              fontSize: 11,
              fontFamily: "var(--font-mono)",
            }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            minTickGap={32}
          />
          <YAxis
            tick={{
              fill: "var(--faint)",
              fontSize: 11,
              fontFamily: "var(--font-mono)",
            }}
            tickLine={false}
            axisLine={false}
            domain={yDomain}
            tickFormatter={(v: number) => valueFormatter(v)}
            width={64}
          />
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.04)" }}
            content={<CandleTooltip valueFormatter={valueFormatter} />}
          />
          {/* Wick: thin bar from low to high */}
          <Bar dataKey="lowHigh" barSize={1} isAnimationActive={false}>
            {data.map((c, i) => (
              <Cell key={`w-${i}`} fill={colorFor(c.direction)} />
            ))}
          </Bar>
          {/* Body: thicker bar from min(open,close) to max(open,close) */}
          <Bar dataKey="openClose" barSize={8} isAnimationActive={false}>
            {data.map((c, i) => (
              <Cell key={`b-${i}`} fill={colorFor(c.direction)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
