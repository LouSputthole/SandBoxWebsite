"use client";

import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Bar,
  BarChart,
} from "recharts";
import type { Candle } from "@/lib/trends/candles";

/**
 * Arcade candlestick (OHLC) chart. ONE Recharts <Bar dataKey="lowHigh"> per
 * candle, drawn with a custom <CandleShape> so the wick and the body always
 * share the same x-center. (Two separate un-stacked <Bar>s do NOT share a
 * center in recharts 3.x — each gets its own sequential band slot, so the wick
 * ends up offset to the side of the body.)
 *
 * recharts gives the shape the band geometry (x / y / width / height) for the
 * low→high range plus the raw OHLC fields (open / close / high / low /
 * direction). We map prices to pixels off that range and draw the wick (thin
 * centered line, low → high) and the body (rectangle, open ↔ close) ourselves.
 * Per-candle color (green up / red down / faint flat) uses the foundation
 * `--up` / `--down` / `--faint` tokens — the sanctioned price-signal use.
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

/** Props recharts injects into a Bar `shape`: band geometry for the dataKey
 *  range (here lowHigh) plus the data entry. recharts reliably passes the
 *  original row as `payload`; depending on version it may ALSO spread the row's
 *  fields top-level, so we read payload first and fall back to top-level. */
interface CandleShapeProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  open?: number;
  close?: number;
  high?: number;
  low?: number;
  direction?: Candle["direction"];
  payload?: Candle;
}

/**
 * One candle: y..y+height spans high..low (the bar's lowHigh range), so
 * `ratio` px-per-price lets us place the open/close body inside that range.
 * Wick and body are both centered on x + width/2.
 */
function CandleShape({
  x = 0,
  y = 0,
  width = 0,
  height = 0,
  payload,
  open: openProp,
  close: closeProp,
  high: highProp,
  low: lowProp,
  direction: directionProp,
}: CandleShapeProps) {
  // payload (the raw Candle) is the source of truth; top-level props are a
  // version-dependent convenience fallback.
  const open = payload?.open ?? openProp ?? 0;
  const close = payload?.close ?? closeProp ?? 0;
  const high = payload?.high ?? highProp ?? 0;
  const low = payload?.low ?? lowProp ?? 0;
  const direction = payload?.direction ?? directionProp ?? "flat";
  const color = colorFor(direction);
  const cx = x + width / 2;
  const range = high - low;
  const ratio = range > 0 ? height / range : 0; // px per price unit
  const bodyTopPrice = Math.max(open, close);
  const bodyBotPrice = Math.min(open, close);
  const bodyTop = y + (high - bodyTopPrice) * ratio;
  // Min 1px so a doji (open === close) still reads as a candle.
  const bodyH = Math.max((bodyTopPrice - bodyBotPrice) * ratio, 1);
  const bodyW = Math.max(Math.min(width * 0.72, 11), 2);
  return (
    <g>
      {/* Wick: thin centered line, high → low. */}
      <line x1={cx} x2={cx} y1={y} y2={y + height} stroke={color} strokeWidth={1} />
      {/* Body: rectangle from open ↔ close, centered on the same x. */}
      <rect x={cx - bodyW / 2} y={bodyTop} width={bodyW} height={bodyH} fill={color} />
    </g>
  );
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
          {/* One bar per candle; the custom shape draws the centered
              wick (low→high) + body (open↔close) off the lowHigh range. */}
          <Bar
            dataKey="lowHigh"
            shape={<CandleShape />}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
