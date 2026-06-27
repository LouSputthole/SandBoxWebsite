"use client";

import { LayoutGrid, List } from "lucide-react";
import { cn } from "@/lib/utils";

export type ItemsView = "grid" | "table";

interface ViewToggleProps {
  value: ItemsView;
  onChange: (view: ItemsView) => void;
}

/**
 * Arcade segmented Grid|Table view toggle. Active segment = accent-tinted
 * fill + accent icon; inactive = muted hover-to-bright. Mirrors the sort-chip
 * active styling so the whole toolbar reads as one system.
 */
export function ViewToggle({ value, onChange }: ViewToggleProps) {
  const options: { value: ItemsView; label: string; Icon: typeof LayoutGrid }[] = [
    { value: "grid", label: "Grid view", Icon: LayoutGrid },
    { value: "table", label: "Table view", Icon: List },
  ];

  return (
    <div
      role="group"
      aria-label="View"
      className="inline-flex items-center gap-1 rounded-[11px] border border-[var(--line)] bg-[var(--panel)] p-1"
    >
      {options.map(({ value: v, label, Icon }) => {
        const active = value === v;
        return (
          <button
            key={v}
            type="button"
            aria-label={label}
            aria-pressed={active}
            data-state={active ? "active" : "inactive"}
            onClick={() => onChange(v)}
            style={
              active
                ? {
                    background: "color-mix(in srgb, var(--accent) 18%, transparent)",
                    color: "var(--accent)",
                  }
                : undefined
            }
            className={cn(
              "inline-flex h-7 w-8 items-center justify-center rounded-[8px] transition-colors",
              !active && "text-[var(--mut)] hover:text-[var(--tx)]"
            )}
          >
            <Icon className="h-4 w-4" />
          </button>
        );
      })}
    </div>
  );
}
