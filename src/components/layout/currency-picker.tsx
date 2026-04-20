"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import { useCurrency } from "@/lib/fx/context";
import { SUPPORTED_CURRENCIES } from "@/lib/fx/rates";

/**
 * Compact navbar dropdown to switch display currency. Top 15-ish
 * currencies (USD, EUR, GBP, JPY, CAD, AUD, CHF, CNY, SEK, NZD, MXN,
 * SGD, HKD, KRW, INR, BRL). Choice persists in localStorage via
 * CurrencyProvider. Rates live-fetched from /api/fx on first load.
 */
export function CurrencyPicker({ variant = "desktop" }: { variant?: "desktop" | "mobile" }) {
  const { currency, setCurrency } = useCurrency();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const active =
    SUPPORTED_CURRENCIES.find((c) => c.code === currency) ??
    SUPPORTED_CURRENCIES[0];

  if (variant === "mobile") {
    // Inline list on mobile — dropdowns inside a hamburger feel bad.
    return (
      <div className="px-3 py-2">
        <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-2">
          Currency
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {SUPPORTED_CURRENCIES.map((c) => {
            const isActive = c.code === currency;
            return (
              <button
                key={c.code}
                type="button"
                onClick={() => setCurrency(c.code)}
                className={`text-xs py-1.5 rounded-md border transition ${
                  isActive
                    ? "border-purple-500/50 bg-purple-500/10 text-purple-200"
                    : "border-neutral-800 bg-neutral-900/50 text-neutral-400 hover:text-white"
                }`}
              >
                <span className="mr-1">{c.flag}</span>
                {c.code}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-md border border-neutral-700/50 bg-neutral-900/50 px-2.5 py-1 text-sm text-neutral-300 hover:border-neutral-600 transition-colors"
        aria-label="Change currency"
      >
        <span className="text-base leading-none">{active.flag}</span>
        <span className="font-medium">{active.code}</span>
        <ChevronDown className="h-3 w-3 text-neutral-500" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 rounded-lg border border-neutral-700 bg-neutral-900 shadow-lg py-1 z-50 max-h-[70vh] overflow-y-auto">
          {SUPPORTED_CURRENCIES.map((c) => {
            const isActive = c.code === currency;
            return (
              <button
                key={c.code}
                type="button"
                onClick={() => {
                  setCurrency(c.code);
                  setOpen(false);
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? "text-purple-200 bg-purple-500/10"
                    : "text-neutral-300 hover:text-white hover:bg-neutral-800"
                }`}
              >
                <span className="text-base leading-none shrink-0">{c.flag}</span>
                <span className="font-medium">{c.code}</span>
                <span className="text-xs text-neutral-500 truncate">{c.name}</span>
                {isActive && <Check className="h-3.5 w-3.5 text-purple-400 ml-auto shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
