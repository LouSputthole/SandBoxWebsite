"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The full sort option set — every key `getItems` / the /api/items route
 * accepts. The 4 quick <SortChips> are a subset of these; this dropdown is the
 * long tail (price low→high, name Z–A, change asc, volume/popularity, supply).
 */
export const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "price-desc", label: "Price: High → Low" },
  { value: "price-asc", label: "Price: Low → High" },
  { value: "change-desc", label: "Biggest gainers" },
  { value: "change-asc", label: "Biggest losers" },
  { value: "volume-desc", label: "Most listings" },
  { value: "volume-asc", label: "Fewest listings" },
  { value: "supply-asc", label: "Rarest (low supply)" },
  { value: "supply-desc", label: "Highest supply" },
  { value: "name-asc", label: "Name: A → Z" },
  { value: "name-desc", label: "Name: Z → A" },
];

interface SortMenuProps {
  value: string;
  onChange: (value: string) => void;
}

/**
 * Arcade "all sorts" dropdown — the long-tail companion to <SortChips>. Both
 * drive the same sort param; chips are quick-access, this covers the rest.
 * Custom popover (not a native <select>) so the open menu matches the dark
 * Arcade surface.
 */
export function SortMenu({ value, onChange }: SortMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = SORT_OPTIONS.find((o) => o.value === value);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-[9px] border border-[var(--line)] bg-[var(--panel)] px-[11px] py-[7px] font-mono text-[11.5px] font-bold leading-none text-[var(--mut)] transition-colors hover:text-[var(--tx)]"
      >
        {current?.label ?? "More sorts"}
        <ChevronDown className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 z-30 mt-2 w-56 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)] p-1 shadow-[0_18px_40px_-12px_rgba(0,0,0,0.7)]"
        >
          {SORT_OPTIONS.map((o) => {
            const active = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                style={
                  active
                    ? {
                        background: "color-mix(in srgb, var(--accent) 14%, transparent)",
                        color: "var(--accent)",
                      }
                    : undefined
                }
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left font-sans text-sm transition-colors",
                  !active && "text-[var(--mut)] hover:bg-[var(--bg2)] hover:text-[var(--tx)]"
                )}
              >
                {o.label}
                {active && <Check className="h-3.5 w-3.5" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
