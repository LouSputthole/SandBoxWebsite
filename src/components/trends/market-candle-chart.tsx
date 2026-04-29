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
 * Candlestick chart for the market-trends history. Two passes through a
 * BarChart:
 *   1. Wicks — `dataKey="lowHigh"`, very thin bar, drawn first so the
 *      body sits on top.
 *   2. Bodies — `dataKey="openClose"`, wider bar.
 *
 * Recharts honors a 2-tuple dataKey by drawing the bar from the first
 * value to the second along the y-axis, which is exactly what a
 * candle wick + body need. Per-bar coloring is via <Cell> children.
 *
 * The y-axis is intentionally clamped to the candle min/max range
 * (Recharts default starts at 0 which crushes any chart with a small
 * relative range — total market cap fluctuates in single-digit % over
 * a day so the auto-domain pinches the candles flat).
 */

const UP_COLOR = "#22c55e";
const DOWN_COLOR = "#ef4444";
const FLAT_COLOR = "#737373";

interface Props {
  data: Candle[];
  format: (v: number) => string;
}

interface CandleTooltipPayload {
  payload: Candle;
}

interface CandleTooltipProps {
  active?: boolean;
  payload?: CandleTooltipPayload[];
  format: (v: number) => string;
}

function CandleTooltip({ active, payload, format }: CandleTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const c = payload[0].payload;
  const change = c.open > 0 ? ((c.close - c.open) / c.open) * 100 : 0;
  const changeColor = change >= 0 ? "text-emerald-300" : "text-red-300";
  return (
    <div className="rounded-md border border-neutral-700 bg-neutral-950/95 px-3 py-2 text-xs text-neutral-200 shadow-lg">
      <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">
        {c.label}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 font-mono">
        <span className="text-neutral-500">O</span>
        <span className="text-right tabular-nums">{format(c.open)}</span>
        <span className="text-neutral-500">H</span>
        <span className="text-right tabular-nums text-emerald-300/80">
          {format(c.high)}
        </span>
        <span className="text-neutral-500">L</span>
        <span className="text-right tabular-nums text-red-300/80">
          {format(c.low)}
        </span>
        <span className="text-neutral-500">C</span>
        <span className="text-right tabular-nums">{format(c.close)}</span>
        <span className="text-neutral-500">Δ</span>
        <span className={`text-right tabular-nums font-semibold ${changeColor}`}>
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

export default function MarketCandleChart({ data, format }: Props) {
  // Compute y-axis domain padding so candles don't kiss the top/bottom
  // edges. 5% of the range on each side feels right for a market chart.
  const allValues = data.flatMap((c) => [c.low, c.high]);
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const pad = (max - min) * 0.05;
  const yDomain: [number, number] = [
    Math.max(0, min - pad),
    max + pad,
  ];

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={data}
        margin={{ top: 8, right: 8, left: 8, bottom: 0 }}
        barCategoryGap="20%"
      >
        <XAxis
          dataKey="label"
          stroke="#525252"
          fontSize={10}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
          minTickGap={32}
        />
        <YAxis
          stroke="#525252"
          fontSize={10}
          tickLine={false}
          axisLine={false}
          domain={yDomain}
          tickFormatter={(v: number) => format(v)}
          width={70}
          orientation="right"
        />
        <Tooltip
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          content={(p: any) => <CandleTooltip {...p} format={format} />}
          cursor={{ fill: "rgba(255,255,255,0.04)" }}
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
  );
}
