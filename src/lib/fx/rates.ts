import { redis } from "@/lib/redis/client";

/**
 * FX rates sourced from Frankfurter (https://www.frankfurter.app/).
 * Public, no API key, backed by European Central Bank reference rates.
 * We fetch once per 24h and cache in Redis since ECB publishes rates
 * on weekdays at ~16:00 CET — more frequent polling would return the
 * same numbers.
 *
 * Rates are expressed as "1 USD = X foreign currency".
 *
 * If the fetch fails and no cached value exists, we fall back to a
 * hardcoded snapshot so the UI stays functional. Rates in the fallback
 * will drift over time; better stale than broken.
 */

export interface FxRates {
  base: "USD";
  rates: Record<string, number>;
  updatedAt: string; // ISO
  source: "frankfurter" | "cache" | "fallback";
}

/** Hardcoded snapshot from mid-April 2026 — only used if both the API
 * and Redis are unavailable. Conservative reasonable values. Covered
 * currencies match SUPPORTED_CURRENCIES below. */
const FALLBACK_RATES: Record<string, number> = {
  USD: 1,
  EUR: 0.93,
  GBP: 0.79,
  JPY: 152.0,
  CAD: 1.38,
  AUD: 1.55,
  CHF: 0.87,
  CNY: 7.2,
  SEK: 10.8,
  NZD: 1.68,
  MXN: 18.5,
  SGD: 1.34,
  HKD: 7.82,
  KRW: 1380,
  INR: 83.2,
  BRL: 5.1,
};

/** Keep this in sync with FALLBACK_RATES. Order = dropdown order. */
export const SUPPORTED_CURRENCIES: ReadonlyArray<{
  code: string;
  name: string;
  symbol: string;
  flag: string;
}> = [
  { code: "USD", name: "US Dollar",          symbol: "$",   flag: "🇺🇸" },
  { code: "EUR", name: "Euro",               symbol: "€",   flag: "🇪🇺" },
  { code: "GBP", name: "British Pound",      symbol: "£",   flag: "🇬🇧" },
  { code: "JPY", name: "Japanese Yen",       symbol: "¥",   flag: "🇯🇵" },
  { code: "CAD", name: "Canadian Dollar",    symbol: "CA$", flag: "🇨🇦" },
  { code: "AUD", name: "Australian Dollar",  symbol: "A$",  flag: "🇦🇺" },
  { code: "CHF", name: "Swiss Franc",        symbol: "Fr",  flag: "🇨🇭" },
  { code: "CNY", name: "Chinese Yuan",       symbol: "¥",   flag: "🇨🇳" },
  { code: "SEK", name: "Swedish Krona",      symbol: "kr",  flag: "🇸🇪" },
  { code: "NZD", name: "New Zealand Dollar", symbol: "NZ$", flag: "🇳🇿" },
  { code: "MXN", name: "Mexican Peso",       symbol: "Mex$",flag: "🇲🇽" },
  { code: "SGD", name: "Singapore Dollar",   symbol: "S$",  flag: "🇸🇬" },
  { code: "HKD", name: "Hong Kong Dollar",   symbol: "HK$", flag: "🇭🇰" },
  { code: "KRW", name: "South Korean Won",   symbol: "₩",   flag: "🇰🇷" },
  { code: "INR", name: "Indian Rupee",       symbol: "₹",   flag: "🇮🇳" },
  { code: "BRL", name: "Brazilian Real",     symbol: "R$",  flag: "🇧🇷" },
];

const CACHE_KEY = "fx:rates:usd";
const CACHE_TTL_SEC = 24 * 60 * 60; // 24h

interface FrankfurterResponse {
  amount: number;
  base: string;
  date: string;
  rates: Record<string, number>;
}

async function fetchFromFrankfurter(): Promise<FxRates | null> {
  // Pass all our supported currencies as the `to` filter so we don't
  // lug around 30+ unused rates. USD is our base; exclude it from the
  // query (Frankfurter rejects the base currency in the `to` list).
  const targets = SUPPORTED_CURRENCIES.filter((c) => c.code !== "USD")
    .map((c) => c.code)
    .join(",");
  const url = `https://api.frankfurter.app/latest?from=USD&to=${targets}`;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      // Next fetch cache — we add our own Redis layer too but this
      // helps when Redis is absent.
      next: { revalidate: CACHE_TTL_SEC },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as FrankfurterResponse;
    if (data.base !== "USD" || !data.rates) return null;
    const rates: Record<string, number> = { USD: 1, ...data.rates };
    return {
      base: "USD",
      rates,
      updatedAt: new Date().toISOString(),
      source: "frankfurter",
    };
  } catch {
    return null;
  }
}

/**
 * Main accessor — returns USD-based rates for all supported currencies.
 * Cache chain: Redis (24h TTL) → Frankfurter fetch → Redis write →
 * hardcoded fallback.
 */
export async function getFxRates(): Promise<FxRates> {
  // 1. Redis cache
  if (redis) {
    try {
      const cached = await redis.get<FxRates>(CACHE_KEY);
      if (cached && cached.rates && Object.keys(cached.rates).length > 1) {
        return { ...cached, source: "cache" };
      }
    } catch {
      // Redis read failed — keep going.
    }
  }

  // 2. Live fetch
  const fresh = await fetchFromFrankfurter();
  if (fresh) {
    if (redis) {
      try {
        await redis.set(CACHE_KEY, fresh, { ex: CACHE_TTL_SEC });
      } catch {
        // Cache write failure is non-fatal.
      }
    }
    return fresh;
  }

  // 3. Fallback
  return {
    base: "USD",
    rates: FALLBACK_RATES,
    updatedAt: new Date(0).toISOString(),
    source: "fallback",
  };
}
