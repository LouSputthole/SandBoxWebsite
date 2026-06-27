"use client";

import { cn } from "@/lib/utils";

/**
 * Browse sort control — the Arcade mono "sort chips".
 *
 * Smaller, JetBrains-Mono chips. Active = accent-tinted fill + accent text +
 * accent hairline; inactive = panel + hairline + muted text. Each label maps
 * to one of the existing `getItems` sort keys so the data query is unchanged.
 */

const SORT_CHIPS: { value: string; label: string }[] = [
  { value: "price-desc", label: "Price" },
  { value: "change-desc", label: "Gainers" },
  { value: "supply-asc", label: "Rarest" },
  { value: "name-asc", label: "A–Z" },
];

interface SortChipsProps {
  value: string;
  onChange: (value: string) => void;
}

export function SortChips({ value, onChange }: SortChipsProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-sans text-xs text-[var(--faint)]">Sort</span>
      <div className="flex flex-wrap items-center gap-2">
        {SORT_CHIPS.map((chip) => {
          const active = value === chip.value;
          return (
            <button
              key={chip.value}
              type="button"
              onClick={() => onChange(chip.value)}
              data-state={active ? "active" : "inactive"}
              style={
                active
                  ? {
                      background: "color-mix(in srgb, var(--accent) 18%, transparent)",
                      color: "var(--accent)",
                      borderColor: "color-mix(in srgb, var(--accent) 45%, transparent)",
                    }
                  : undefined
              }
              className={cn(
                "rounded-[9px] border px-[11px] py-[7px] font-mono text-[11.5px] font-bold leading-none transition-colors",
                !active &&
                  "border-[var(--line)] bg-[var(--panel)] text-[var(--mut)] hover:text-[var(--tx)]"
              )}
            >
              {chip.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
