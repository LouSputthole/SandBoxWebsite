"use client";

import { ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

interface TypeChartData {
  name: string;
  value: number;
  totalValue?: number;
}

interface TypePieChartProps {
  data: TypeChartData[];
  colors: Record<string, string>;
}

/**
 * Compact pie chart for the type breakdown. Lazy-loaded so recharts stays out
 * of the initial bundle.
 */
export default function TypePieChart({ data, colors }: TypePieChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={25}
          outerRadius={40}
          paddingAngle={2}
          dataKey="value"
        >
          {data.map((entry) => (
            <Cell key={entry.name} fill={colors[entry.name] || "#525252"} />
          ))}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}
