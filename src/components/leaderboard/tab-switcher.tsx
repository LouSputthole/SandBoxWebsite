"use client";

import Link from "next/link";
import { tabs, type LeaderboardTab } from "./tabs";

export { type LeaderboardTab } from "./tabs";

export function LeaderboardTabSwitcher({ active }: { active: LeaderboardTab }) {
  return (
    <div className="flex gap-1 p-1 rounded-xl bg-neutral-900 border border-neutral-800 mb-6 overflow-x-auto">
      {tabs.map((t) => {
        const Icon = t.icon;
        const isActive = active === t.key;
        return (
          <Link
            key={t.key}
            href={`/leaderboard?tab=${t.key}`}
            scroll={false}
            replace
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              isActive ? "bg-neutral-800 text-white" : "text-neutral-500 hover:text-neutral-300"
            }`}
          >
            <Icon className="h-4 w-4" />
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
