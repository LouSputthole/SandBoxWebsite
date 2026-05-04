"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { PARTNER } from "@/lib/partner/config";

const SIDES = [
  { value: "", label: "All sides" },
  { value: "selling", label: "Selling items" },
  { value: "buying", label: "Buying items" },
  { value: "both", label: "Item ↔ item" },
];

// Meeting-place values mirror the schema column. Empty string = no
// filter (all listings). Hub + Either pills only render when the
// partner kill-switch is on, so toggling PARTNER.enabled hides the
// whole row of partner UI in one place.
const MEETING_PLACES = [
  { value: "", label: "Any meeting place" },
  { value: "steam_trade", label: "Steam trade" },
  { value: "trading_hub", label: PARTNER.shortName },
  { value: "either", label: "Either" },
];

/**
 * Search + side + meeting-place filters for the trade feed. Pushes
 * URL changes via router.replace so that the server component
 * re-runs with the new searchParams and re-renders the list.
 * Debounces the text input by 300ms so we don't fire a navigation
 * on every keystroke.
 */
export function TradeFeedFilters({
  initialQ,
  initialSide,
  initialMeetingPlace,
}: {
  initialQ: string;
  initialSide: string;
  initialMeetingPlace: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(initialQ);

  useEffect(() => {
    const handle = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (q) params.set("q", q);
      else params.delete("q");
      params.delete("page"); // any filter change resets to page 1
      const next = params.toString();
      router.replace(`${pathname}${next ? `?${next}` : ""}`, { scroll: false });
    }, 300);
    return () => clearTimeout(handle);
    // We intentionally don't depend on searchParams here — that would loop
    // every time the URL changed (which is what we just caused).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const updateParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete("page");
    const next = params.toString();
    router.replace(`${pathname}${next ? `?${next}` : ""}`, { scroll: false });
  };

  return (
    <div className="space-y-3 mb-6">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-500" />
        <Input
          placeholder="Search by item name or description..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="pl-9 h-11"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 p-1 rounded-lg bg-neutral-900 border border-neutral-800 w-fit overflow-x-auto">
          {SIDES.map((s) => {
            const active = (initialSide || "") === s.value;
            return (
              <button
                key={s.value || "all"}
                onClick={() => updateParam("side", s.value)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition whitespace-nowrap ${
                  active ? "bg-neutral-800 text-white" : "text-neutral-400 hover:text-white"
                }`}
              >
                {s.label}
              </button>
            );
          })}
        </div>
        {PARTNER.enabled && (
          <div className="flex items-center gap-1 p-1 rounded-lg bg-neutral-900 border border-neutral-800 w-fit overflow-x-auto">
            {MEETING_PLACES.map((m) => {
              const active = (initialMeetingPlace || "") === m.value;
              return (
                <button
                  key={m.value || "all"}
                  onClick={() => updateParam("meeting", m.value)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition whitespace-nowrap ${
                    active ? "bg-neutral-800 text-white" : "text-neutral-400 hover:text-white"
                  }`}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
