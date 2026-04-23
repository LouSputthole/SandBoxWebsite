"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { SUPPORTED_CURRENCIES } from "./rates";

const STORAGE_KEY = "sboxskins.currency";

interface CurrencyContextValue {
  /** Current chosen currency code (USD by default). */
  currency: string;
  /** Change the chosen currency (also persists to localStorage). */
  setCurrency: (code: string) => void;
  /** Lookup table: currency code → how many of that currency equals $1 USD. */
  rates: Record<string, number>;
  /** Whether FX rates have loaded (vs initial defaults). */
  loaded: boolean;
}

const CurrencyContext = createContext<CurrencyContextValue>({
  currency: "USD",
  setCurrency: () => {},
  rates: { USD: 1 },
  loaded: false,
});

export function CurrencyProvider({ children }: { children: ReactNode }) {
  // Start as USD so server-rendered HTML matches the first client render
  // (no hydration mismatch). Swap to user's saved currency in useEffect.
  const [currency, setCurrencyState] = useState("USD");
  const [rates, setRates] = useState<Record<string, number>>({ USD: 1 });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // Restore persisted choice. One-shot read on mount — the set-state-
    // in-effect rule is over-eager for this "hydrate from localStorage"
    // pattern, which is what React docs explicitly suggest for it.
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && SUPPORTED_CURRENCIES.some((c) => c.code === saved)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setCurrencyState(saved);
      }
    } catch {
      // localStorage unavailable (private mode, iframe sandbox) — no-op.
    }

    // Fetch latest FX rates. /api/fx is CDN-cached for a day so this
    // is a cheap, fast request after the first visit.
    let cancelled = false;
    fetch("/api/fx")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data?.rates) return;
        setRates(data.rates as Record<string, number>);
        setLoaded(true);
      })
      .catch(() => {
        // Keep default rates (USD only) — prices will render as USD.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setCurrency = useCallback((code: string) => {
    setCurrencyState(code);
    try {
      localStorage.setItem(STORAGE_KEY, code);
    } catch {
      // no-op
    }
  }, []);

  const value = useMemo<CurrencyContextValue>(
    () => ({ currency, setCurrency, rates, loaded }),
    [currency, setCurrency, rates, loaded],
  );

  return (
    <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>
  );
}

export function useCurrency() {
  return useContext(CurrencyContext);
}

/** Convert a USD amount into the user's chosen currency. Falls back to
 * the USD amount if the target currency's rate isn't loaded yet (which
 * keeps SSR + first-paint consistent). */
export function convertFromUsd(
  usdAmount: number,
  currency: string,
  rates: Record<string, number>,
): number {
  if (currency === "USD") return usdAmount;
  const rate = rates[currency];
  if (!rate || rate <= 0) return usdAmount;
  return usdAmount * rate;
}

/** Format a USD amount into the user's chosen currency using
 * Intl.NumberFormat. JPY/KRW use 0 decimals (smallest unit is 1);
 * others use 2. */
export function formatInCurrency(
  usdAmount: number,
  currency: string,
  rates: Record<string, number>,
): string {
  const converted = convertFromUsd(usdAmount, currency, rates);
  const zeroDecimal = currency === "JPY" || currency === "KRW";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: zeroDecimal ? 0 : 2,
      maximumFractionDigits: zeroDecimal ? 0 : 2,
    }).format(converted);
  } catch {
    // Intl unhappy (unknown code) → USD.
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(usdAmount);
  }
}
