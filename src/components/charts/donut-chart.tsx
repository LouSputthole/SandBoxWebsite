"use client";

import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";

/**
 * Arcade donut / pie chart. A ring of category-colored slices with a
 * panel + hairline tooltip (label · value · share). Pure presentation —
 * pass pre-shaped, pre-colored slices in. Render the legend yourself
 * alongside it (the parent owns labels + counts).
 */

export interface DonutSlice {
  /** Stable key (e.g. the type slug). */
  name: string;
  /** Human label for the tooltip. Falls back to `name`. */
  label?: string;
  /** Slice magnitude. */
  value: number;
  /** CSS color, e.g. var(--cat-clothing). */
  color: string;
}

export interface DonutChartProps {
  data: DonutSlice[];
  height?: number;
  innerRadius?: number;
  outerRadius?: number;
  /** Formats the value in the tooltip. Defaults to a locale count. */
  valueFormatter?: (v: number) => string;
}

interface DonutTooltipItem {
  payload?: DonutSlice;
  value?: number;
}

interface DonutTooltipProps {
  active?: boolean;
  payload?: DonutTooltipItem[];
  total?: number;
  valueFormatter?: (v: number) => string;
}

function DonutTooltip({
  active,
  payload,
  total = 0,
  valueFormatter = (v) => v.toLocaleString(),
}: DonutTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const slice = payload[0]?.payload;
  if (!slice) return null;
  const pct = total > 0 ? (slice.value / total) * 100 : 0;
  return (
    <div className="rounded-[10px] border border-line bg-panel px-[11px] py-2 shadow-[0_12px_30px_-12px_rgba(0,0,0,.7)]">
      <div className="flex items-center gap-2">
        <span
          className="h-2.5 w-2.5 rounded-[3px]"
          style={{ background: slice.color }}
        />
        <span className="font-mono text-[11px] text-faint">
          {slice.label ?? slice.name}
        </span>
      </div>
      <div className="mt-1 font-mono text-[13px] font-bold text-tx">
        {valueFormatter(slice.value)}
        <span className="ml-1.5 font-normal text-faint">
          {pct.toFixed(1)}%
        </span>
      </div>
    </div>
  );
}

export function DonutChart({
  data,
  height = 150,
  innerRadius = 38,
  outerRadius = 62,
  valueFormatter,
}: DonutChartProps) {
  const total = data.reduce((sum, s) => sum + s.value, 0);

  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={innerRadius}
            outerRadius={outerRadius}
            paddingAngle={2}
            dataKey="value"
            nameKey="name"
            stroke="var(--panel)"
            strokeWidth={2}
            isAnimationActive={false}
          >
            {data.map((slice) => (
              <Cell key={slice.name} fill={slice.color} />
            ))}
          </Pie>
          <Tooltip
            content={
              <DonutTooltip total={total} valueFormatter={valueFormatter} />
            }
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
