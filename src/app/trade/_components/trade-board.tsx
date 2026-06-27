"use client";

import { useMemo, useState } from "react";
import { ArrowRightLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { OfferCard, type OfferListing } from "./offer-card";

export type TradeBoardListing = OfferListing;

type FilterKey = "all" | "selling" | "buying" | "both";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "selling", label: "Selling" },
  { key: "buying", label: "Buying" },
  { key: "both", label: "Trading" },
];

/**
 * Client board: the All/Selling/Buying/Trading filter chips plus the 2-col grid
 * of offer cards. The chips filter the already-loaded listings client-side (no
 * round-trip) per the Arcade mockup; counts are derived from the loaded set.
 */
export function TradeBoard({ listings }: { listings: TradeBoardListing[] }) {
  const [filter, setFilter] = useState<FilterKey>("all");

  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = {
      all: listings.length,
      selling: 0,
      buying: 0,
      both: 0,
    };
    for (const l of listings) {
      if (l.side === "selling") c.selling++;
      else if (l.side === "buying") c.buying++;
      else if (l.side === "both") c.both++;
    }
    return c;
  }, [listings]);

  const visible =
    filter === "all"
      ? listings
      : listings.filter((l) => l.side === filter);

  return (
    <>
      {/* filter chips */}
      <div className="mb-5 flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              aria-pressed={active}
              className={cn(
                "inline-flex items-center gap-2 rounded-[11px] border px-[15px] py-2 text-[13px] font-semibold transition-colors",
                active
                  ? "border-transparent bg-accent text-white"
                  : "border-line bg-panel text-mut hover:text-tx"
              )}
            >
              {f.label}
              <span className="font-mono text-[12px] opacity-60">
                {counts[f.key]}
              </span>
            </button>
          );
        })}
      </div>

      {/* offer grid */}
      {visible.length === 0 ? (
        <div className="rounded-[18px] border border-line bg-panel p-12 text-center">
          <ArrowRightLeft className="mx-auto mb-3 h-9 w-9 text-faint/60" />
          <p className="text-sm text-mut">
            {filter === "all"
              ? "No active trades yet — be the first to post one!"
              : "No trades match this filter."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {visible.map((l) => (
            <OfferCard key={l.id} listing={l} />
          ))}
        </div>
      )}
    </>
  );
}
