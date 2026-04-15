"use client";

import dynamic from "next/dynamic";

// Tiny client-side wrapper so the parent server component can import a client
// component that does its OWN dynamic import — Next.js 16 doesn't allow
// `ssr: false` with next/dynamic in Server Components.
const TypePieChart = dynamic(() => import("./type-pie-chart"), { ssr: false });

interface TypeChartData {
  name: string;
  value: number;
  totalValue?: number;
}

export function TypePieChartWrapper({
  data,
  colors,
}: {
  data: TypeChartData[];
  colors: Record<string, string>;
}) {
  return <TypePieChart data={data} colors={colors} />;
}
