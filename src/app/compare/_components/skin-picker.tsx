"use client";

import { Plus, ChevronDown } from "lucide-react";
import { formatPrice } from "@/lib/utils";

interface Option {
  slug: string;
  name: string;
  currentPrice: number | null;
}

/**
 * Add-a-column picker. A plain GET form to /compare: every currently-selected
 * skin is carried as a hidden input so the navigation preserves the other
 * columns, and the chosen skin fills the next free slot (`slot`). Auto-submits
 * on change — that's the only reason it needs to be a client component.
 */
export function SkinPicker({
  slot,
  preserve,
  options,
  className = "",
}: {
  slot: string;
  preserve: { name: string; value: string }[];
  options: Option[];
  className?: string;
}) {
  return (
    <form method="get" action="/compare" className={className}>
      {preserve.map((p) => (
        <input key={p.name} type="hidden" name={p.name} value={p.value} />
      ))}
      <div className="relative">
        <Plus
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--faint)]"
          aria-hidden
        />
        <select
          name={slot}
          defaultValue=""
          aria-label="Add a skin to compare"
          onChange={(e) => e.currentTarget.form?.submit()}
          className="h-10 w-full min-w-[200px] cursor-pointer appearance-none rounded-[12px] border border-[var(--line)] bg-[var(--panel)] pl-9 pr-9 text-sm font-medium text-[var(--tx)] outline-none transition-colors focus:border-[var(--accent)]"
        >
          <option value="" disabled>
            Add a skin…
          </option>
          {options.map((o) => (
            <option key={o.slug} value={o.slug}>
              {o.name}
              {o.currentPrice ? ` · ${formatPrice(o.currentPrice)}` : ""}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--faint)]"
          aria-hidden
        />
      </div>
    </form>
  );
}
