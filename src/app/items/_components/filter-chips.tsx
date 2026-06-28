"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * Browse type filter — the Arcade "filter chips" row.
 *
 * Reuses the shared <Tabs>/<TabsTrigger> primitive (active = filled brand
 * purple + white, inactive = panel + hairline), with a mono live-count after
 * each label. "All" maps to an empty type value (no filter); the rest map to
 * the singular `Item.type` values stored in the DB.
 */

const TYPE_CHIPS: { value: string; label: string }[] = [
  { value: "", label: "All" },
  { value: "clothing", label: "Clothing" },
  { value: "accessory", label: "Accessories" },
  { value: "character", label: "Characters" },
  { value: "weapon", label: "Weapons" },
  { value: "tool", label: "Tools" },
];

interface FilterChipsProps {
  /** Active type value ("" = All). */
  value: string;
  /** Catalog-wide count per singular type value. */
  counts: Record<string, number>;
  /** Catalog-wide total (used for the "All" chip). */
  total: number;
  onChange: (value: string) => void;
}

export function FilterChips({ value, counts, total, onChange }: FilterChipsProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-sans text-xs text-[var(--faint)]">Type</span>
      <Tabs value={value} onValueChange={onChange}>
        <TabsList className="gap-2" aria-label="Filter by type">
          {TYPE_CHIPS.map((chip) => {
            const count = chip.value === "" ? total : counts[chip.value] ?? 0;
            return (
              <TabsTrigger key={chip.value || "all"} value={chip.value}>
                {chip.label}
                <span className="font-mono opacity-60">{count}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>
    </div>
  );
}
