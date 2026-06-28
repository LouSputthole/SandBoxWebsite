"use client";

import { useState } from "react";
import { X } from "lucide-react";

interface PriceRangeFilterProps {
  minPrice: string;
  maxPrice: string;
  /** Commit handler — fires on blur / Enter, not per keystroke, so we don't
   *  fetch on partial numbers (e.g. while typing "10."). */
  onApply: (minPrice: string, maxPrice: string) => void;
  /** Clear ALL active filters (search/type/price/sort). */
  onClear: () => void;
  /** Show the "Clear filters" reset (any filter active). */
  showClear: boolean;
}

const inputClass =
  "h-9 w-[84px] rounded-lg border border-[var(--line)] bg-[var(--panel)] px-2.5 font-mono text-sm text-[var(--tx)] placeholder:text-[var(--faint)] transition-colors focus-visible:border-[var(--accent)] focus-visible:outline-none";

/**
 * Arcade price-range filter — Min/Max numeric inputs that drive the existing
 * minPrice/maxPrice query params, plus a "Clear filters" reset. Local input
 * state commits on blur / Enter (the query already accepts these params, so
 * deep links like ?minPrice= keep working too).
 */
export function PriceRangeFilter({
  minPrice,
  maxPrice,
  onApply,
  onClear,
  showClear,
}: PriceRangeFilterProps) {
  const [min, setMin] = useState(minPrice);
  const [max, setMax] = useState(maxPrice);

  // Keep local inputs in sync when the committed values change elsewhere
  // (e.g. "Clear filters" or a deep-linked URL). React's "adjusting state when
  // a prop changes" pattern — sync during render via stored previous props, not
  // in an effect, so typing isn't clobbered and react-hooks/set-state-in-effect
  // doesn't fire.
  const [prevMin, setPrevMin] = useState(minPrice);
  const [prevMax, setPrevMax] = useState(maxPrice);
  if (minPrice !== prevMin) {
    setPrevMin(minPrice);
    setMin(minPrice);
  }
  if (maxPrice !== prevMax) {
    setPrevMax(maxPrice);
    setMax(maxPrice);
  }

  const commit = () => {
    if (min !== minPrice || max !== maxPrice) onApply(min, max);
  };

  return (
    <div className="flex items-center gap-2">
      <span className="font-sans text-xs text-[var(--faint)]">Price</span>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          commit();
        }}
        className="flex items-center gap-1.5"
      >
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          placeholder="Min"
          aria-label="Minimum price"
          value={min}
          onChange={(e) => setMin(e.target.value)}
          onBlur={commit}
          className={inputClass}
        />
        <span className="text-[var(--faint)]">–</span>
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          placeholder="Max"
          aria-label="Maximum price"
          value={max}
          onChange={(e) => setMax(e.target.value)}
          onBlur={commit}
          className={inputClass}
        />
      </form>
      {showClear && (
        <button
          type="button"
          onClick={onClear}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-sans text-xs text-[var(--faint)] transition-colors hover:text-[var(--tx)]"
        >
          <X className="h-3 w-3" />
          Clear filters
        </button>
      )}
    </div>
  );
}
