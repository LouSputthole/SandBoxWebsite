"use client";

import * as React from "react";
import { useMemo, useState } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  TimeframeToggle,
  type Timeframe,
} from "@/components/charts";
import { formatPrice } from "@/lib/utils";

/**
 * Enriched Arcade price-history card: the accent area chart with volume bars
 * overlaid, a High / Low / Avg / Change% stat grid, the "N data points"
 * caption, and the shared Arcade timeframe toggle. The page already loads the
 * full history, so the toggle narrows the window client-side (no refetch).
 *
 * Built on recharts' ComposedChart (Area + Bar) rather than the foundation
 * <AreaChartCard>, since that one can't overlay volume bars — but it mirrors
 * the same Arcade tokens, gradient fill, and panel/hairline tooltip.
 */

interface PricePoint {
  id: string;
  price: number;
  volume: number | null;
  timestamp: string;
}

const TF_DAYS: Record<Exclude<Timeframe, "ALL">, number> = {
  "24H": 1,
  "7D": 7,
  "30D": 30,
  "90D": 90,
};

/**
 * Narrow the (ascending) series to the selected timeframe. Kept at module
 * scope so the `Date.now()` read stays out of the component render body (the
 * repo's react-hooks/purity rule flags impure calls during render). Falls back
 * to the full series when the window is too sparse to draw.
 */
function windowByTimeframe(sorted: PricePoint[], tf: Timeframe): PricePoint[] {
  if (tf === "ALL") return sorted;
  const cutoff = Date.now() - TF_DAYS[tf] * 24 * 60 * 60 * 1000;
  const windowed = sorted.filter(
    (p) => new Date(p.timestamp).getTime() >= cutoff,
  );
  return windowed.length >= 2 ? windowed : sorted;
}

/** Median of a non-empty array (robust endpoint for the Change% stat). */
function medianOf(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

interface ChartRow {
  timestamp: string;
  price: number;
  volume: number;
}

interface TooltipPayloadItem {
  dataKey?: string | number;
  value?: number | string;
  payload?: ChartRow;
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  return (
    <div className="rounded-[10px] border border-line bg-panel px-[11px] py-2 shadow-[0_12px_30px_-12px_rgba(0,0,0,.7)]">
      <div className="font-mono text-[11px] text-faint">
        {new Date(row.timestamp).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}
      </div>
      <div className="font-mono text-[13px] font-bold text-tx">
        {formatPrice(row.price)}
      </div>
      {row.volume > 0 && (
        <div className="font-mono text-[11px] text-faint">
          Vol {row.volume.toLocaleString()}
        </div>
      )}
    </div>
  );
}

function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[18px] border border-line bg-panel p-5">{children}</div>
  );
}

function Header({
  tf,
  onTf,
}: {
  tf?: Timeframe;
  onTf?: (tf: Timeframe) => void;
}) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="m-0 font-display text-[18px] font-bold text-tx">
          Price history
        </h2>
        <div className="mt-0.5 text-[12.5px] text-faint">
          Steam Community Market · USD
        </div>
      </div>
      {tf && onTf && <TimeframeToggle value={tf} onChange={onTf} />}
    </div>
  );
}

export function PriceHistoryCard({
  priceHistory,
  priceChange24h,
}: {
  priceHistory: PricePoint[];
  priceChange24h: number | null;
}) {
  const [tf, setTf] = useState<Timeframe>("ALL");

  const { rows, stats, hasVolume } = useMemo(() => {
    const sorted = [...priceHistory].sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );

    const visible = windowByTimeframe(sorted, tf);

    const mapped: ChartRow[] = visible.map((p) => ({
      timestamp: p.timestamp,
      price: p.price,
      volume: p.volume ?? 0,
    }));

    const prices = visible.map((p) => p.price);
    if (prices.length === 0) {
      return { rows: mapped, stats: null, hasVolume: false };
    }

    const high = Math.max(...prices);
    const low = Math.min(...prices);
    const avg = prices.reduce((s, p) => s + p, 0) / prices.length;
    // Robust change: median of the first/last N points rather than raw
    // endpoints (Steam occasionally returns a spurious boundary reading).
    const n = Math.max(1, Math.min(5, Math.floor(prices.length / 10) + 1));
    const startPrice = medianOf(prices.slice(0, n));
    const endPrice = medianOf(prices.slice(-n));
    const computedChange =
      startPrice > 0 ? ((endPrice - startPrice) / startPrice) * 100 : 0;
    // On the 24H view prefer the DB-computed change so this stat agrees with
    // the item header; longer windows compute from the visible data.
    const changePercent =
      tf === "24H" && typeof priceChange24h === "number"
        ? priceChange24h
        : computedChange;

    return {
      rows: mapped,
      stats: { high, low, avg, changePercent, count: visible.length },
      hasVolume: mapped.some((d) => d.volume > 0),
    };
  }, [priceHistory, tf, priceChange24h]);

  const gid = "phGrad-" + React.useId().replace(/:/g, "");

  if (priceHistory.length === 0) {
    return (
      <CardShell>
        <Header />
        <div className="flex h-[220px] items-center justify-center text-sm text-faint">
          No price history tracked yet.
        </div>
      </CardShell>
    );
  }

  const changeColor =
    stats && stats.changePercent > 0
      ? "var(--up)"
      : stats && stats.changePercent < 0
        ? "var(--down)"
        : "var(--mut)";

  return (
    <CardShell>
      <Header tf={tf} onTf={setTf} />

      {/* High / Low / Avg / Change% */}
      {stats && (
        <div className="mb-3.5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <ChartStat label="High" value={formatPrice(stats.high)} />
          <ChartStat label="Low" value={formatPrice(stats.low)} />
          <ChartStat label="Avg" value={formatPrice(stats.avg)} />
          <ChartStat
            label="Change"
            value={`${stats.changePercent >= 0 ? "+" : ""}${stats.changePercent.toFixed(1)}%`}
            color={changeColor}
          />
        </div>
      )}

      {/* Chart — a lone data point can't draw a line, so show a dedicated
          state instead of an empty plot until we've tracked two+ points. */}
      {rows.length <= 1 ? (
        <div className="flex h-[220px] flex-col items-center justify-center gap-1 text-center">
          <span className="text-sm text-faint">Not enough price history yet</span>
          <span className="text-[11.5px] text-faint">
            Charting begins once we&apos;ve tracked at least two price points.
          </span>
        </div>
      ) : (
        <div style={{ width: "100%", height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={rows}
            margin={{ top: 6, right: 6, bottom: 0, left: 0 }}
          >
            <defs>
              <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.32} />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              vertical={false}
              stroke="var(--line)"
              strokeOpacity={0.6}
              strokeDasharray="3 3"
            />
            <XAxis
              dataKey="timestamp"
              tick={{
                fill: "var(--faint)",
                fontSize: 11,
                fontFamily: "var(--font-mono)",
              }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              minTickGap={36}
              tickFormatter={(t) =>
                new Date(t).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })
              }
            />
            <YAxis
              yAxisId="price"
              tick={{
                fill: "var(--faint)",
                fontSize: 11,
                fontFamily: "var(--font-mono)",
              }}
              tickLine={false}
              axisLine={false}
              width={52}
              domain={["auto", "auto"]}
              tickFormatter={(v) => formatPrice(Number(v))}
            />
            {hasVolume && (
              <YAxis
                yAxisId="volume"
                orientation="right"
                hide
                domain={[0, (dataMax: number) => dataMax * 4]}
              />
            )}
            <Tooltip
              cursor={{ stroke: "var(--line)", strokeWidth: 1 }}
              content={<ChartTooltip />}
            />
            {hasVolume && (
              <Bar
                yAxisId="volume"
                dataKey="volume"
                fill="var(--accent)"
                opacity={0.16}
                radius={[2, 2, 0, 0]}
                isAnimationActive={false}
              />
            )}
            <Area
              yAxisId="price"
              type="monotone"
              dataKey="price"
              stroke="var(--accent)"
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill={`url(#${gid})`}
              dot={false}
              activeDot={{
                r: 3.5,
                stroke: "var(--panel)",
                strokeWidth: 2,
                fill: "var(--accent)",
              }}
              isAnimationActive={false}
            />
          </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {stats && (
        <div className="mt-3 text-right">
          <span className="font-mono text-[10.5px] text-faint">
            {stats.count} data point{stats.count === 1 ? "" : "s"}
          </span>
        </div>
      )}
    </CardShell>
  );
}

function ChartStat({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="rounded-[12px] border border-line bg-bg2 px-3 py-2.5">
      <div className="mb-1 text-[10.5px] text-faint">{label}</div>
      <div
        className="font-mono text-[15px] font-bold text-tx"
        style={color ? { color } : undefined}
      >
        {value}
      </div>
    </div>
  );
}
