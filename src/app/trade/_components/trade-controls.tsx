"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

/** Per-side listing counts (full dataset, not just the current page) used to
 *  label the All/Selling/Buying/Trading chips. */
export interface SideCounts {
  all: number;
  selling: number;
  buying: number;
  both: number;
}

type ChipKey = "all" | "selling" | "buying" | "both";

const CHIPS: { key: ChipKey; value: string; label: string }[] = [
  { key: "all", value: "", label: "All" },
  { key: "selling", value: "selling", label: "Selling" },
  { key: "buying", value: "buying", label: "Buying" },
  { key: "both", value: "both", label: "Trading" },
];

/**
 * Arcade search box + side chips for the trading board. Unlike the first
 * Arcade pass (which filtered an already-loaded 60-row slice client-side),
 * these drive the URL searchParams so the *server* re-queries: search hits
 * every active listing, the side filter is shareable, and both compose with
 * pagination. Text input is debounced 300ms; any change resets to page 1.
 */
export function TradeControls({
  q: initialQ,
  side,
  counts,
}: {
  q: string;
  side: string;
  counts: SideCounts;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(initialQ);

  function pushParams(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    const next = params.toString();
    router.replace(`${pathname}${next ? `?${next}` : ""}`, { scroll: false });
  }

  // Debounce the search input → ?q=. Skip when the box already matches the URL
  // (mount + just-navigated) so we don't fire a redundant navigation.
  useEffect(() => {
    if (q === initialQ) return;
    const handle = setTimeout(() => {
      pushParams({ q: q || null, page: null });
    }, 300);
    return () => clearTimeout(handle);
    // Only the local query text should re-arm the debounce.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const activeSide = side || "";

  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      {/* search */}
      <div className="relative w-full sm:max-w-[320px]">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search items or description…"
          aria-label="Search trades"
          className="h-10 w-full rounded-[11px] border border-line bg-panel pl-9 pr-3 text-[13px] text-tx outline-none transition-colors placeholder:text-faint focus:border-accent"
        />
      </div>

      {/* side chips */}
      <div className="flex flex-wrap gap-2">
        {CHIPS.map((c) => {
          const active = activeSide === c.value;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => pushParams({ side: c.value || null, page: null })}
              aria-pressed={active}
              className={cn(
                "inline-flex items-center gap-2 rounded-[11px] border px-[15px] py-2 text-[13px] font-semibold transition-colors",
                active
                  ? "border-transparent bg-accent text-white"
                  : "border-line bg-panel text-mut hover:text-tx"
              )}
            >
              {c.label}
              <span className="font-mono text-[12px] opacity-60">
                {counts[c.key]}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
