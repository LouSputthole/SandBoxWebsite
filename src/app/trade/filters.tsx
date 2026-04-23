"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

const SIDES = [
  { value: "", label: "All sides" },
  { value: "selling", label: "Selling items" },
  { value: "buying", label: "Buying items" },
  { value: "both", label: "Item ↔ item" },
];

/**
 * Search + side filters for the trade feed. Pushes URL changes via
 * router.replace so that the server component re-runs with the new
 * searchParams and re-renders the list. Debounces the text input by 300ms
 * so we don't fire a navigation on every keystroke.
 */
export function TradeFeedFilters({
  initialQ,
  initialSide,
}: {
  initialQ: string;
  initialSide: string;
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

  const setSide = (side: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (side) params.set("side", side);
    else params.delete("side");
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
      <div className="flex items-center gap-1 p-1 rounded-lg bg-neutral-900 border border-neutral-800 w-fit overflow-x-auto">
        {SIDES.map((s) => {
          const active = (initialSide || "") === s.value;
          return (
            <button
              key={s.value || "all"}
              onClick={() => setSide(s.value)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition whitespace-nowrap ${
                active ? "bg-neutral-800 text-white" : "text-neutral-400 hover:text-white"
              }`}
            >
              {s.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
