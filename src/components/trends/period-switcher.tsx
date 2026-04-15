"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

const periods = [
  { label: "7D", value: "7d" },
  { label: "30D", value: "30d" },
  { label: "90D", value: "90d" },
  { label: "All", value: "all" },
];

export function PeriodSwitcher({ currentPeriod }: { currentPeriod: string }) {
  return (
    <div className="flex items-center gap-1">
      {periods.map((p) => (
        <Link key={p.value} href={`/trends?period=${p.value}`} scroll={false} replace>
          <Button
            variant={currentPeriod === p.value ? "secondary" : "ghost"}
            size="sm"
            className="text-xs h-7 px-2.5"
          >
            {p.label}
          </Button>
        </Link>
      ))}
    </div>
  );
}
