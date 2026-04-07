import type { SteamSearchResponse, SteamPriceOverview } from "./types";

const STEAM_APPID = 590830;
const STEAM_MARKET_BASE = "https://steamcommunity.com/market";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json, text/javascript, */*; q=0.01",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: `${STEAM_MARKET_BASE}/search?appid=${STEAM_APPID}`,
};

// Simple rate limiter: ensures minimum delay between requests
class RateLimiter {
  private lastRequest = 0;
  private minDelay: number;

  constructor(minDelayMs: number) {
    this.minDelay = minDelayMs;
  }

  async wait(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequest;
    if (elapsed < this.minDelay) {
      await new Promise((resolve) =>
        setTimeout(resolve, this.minDelay - elapsed)
      );
    }
    this.lastRequest = Date.now();
  }
}

// 3-second delay between requests to respect Steam rate limits
const rateLimiter = new RateLimiter(3000);

/**
 * Fetch a URL from Steam with proper headers and rate limiting.
 * Returns null on failure instead of throwing.
 */
async function steamFetch<T>(url: string): Promise<T | null> {
  await rateLimiter.wait();

  try {
    const response = await fetch(url, {
      headers: HEADERS,
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      console.error(
        `Steam API error: ${response.status} ${response.statusText} for ${url}`
      );
      return null;
    }

    return (await response.json()) as T;
  } catch (error) {
    console.error(`Steam API fetch failed for ${url}:`, error);
    return null;
  }
}

/**
 * Search/list all S&box items on the Steam Community Market.
 * Paginates through results in batches of `count`.
 */
export async function searchMarketItems(
  start = 0,
  count = 100
): Promise<SteamSearchResponse | null> {
  const params = new URLSearchParams({
    query: "",
    start: start.toString(),
    count: count.toString(),
    search_descriptions: "0",
    sort_by: "quantity",
    sort_dir: "desc",
    appid: STEAM_APPID.toString(),
    norender: "1",
  });

  return steamFetch<SteamSearchResponse>(
    `${STEAM_MARKET_BASE}/search/render/?${params}`
  );
}

/**
 * Get current price overview for a specific item.
 * Returns lowest price, median price, and volume.
 */
export async function getPriceOverview(
  marketHashName: string,
  currency = 1 // USD
): Promise<SteamPriceOverview | null> {
  const params = new URLSearchParams({
    appid: STEAM_APPID.toString(),
    currency: currency.toString(),
    market_hash_name: marketHashName,
  });

  return steamFetch<SteamPriceOverview>(
    `${STEAM_MARKET_BASE}/priceoverview/?${params}`
  );
}

/**
 * Fetch ALL items from the Steam Market by paginating through search results.
 * S&box typically has <1000 items, so this is feasible.
 */
export async function fetchAllMarketItems(): Promise<SteamSearchResponse["results"]> {
  const allItems: SteamSearchResponse["results"] = [];
  let start = 0;
  const count = 100;

  while (true) {
    const response = await searchMarketItems(start, count);

    if (!response || !response.success || !response.results?.length) {
      break;
    }

    allItems.push(...response.results);

    // If we got fewer results than requested, we've reached the end
    if (response.results.length < count || allItems.length >= response.total_count) {
      break;
    }

    start += count;
  }

  return allItems;
}

/**
 * Build the Steam CDN image URL from an icon_url hash.
 */
export function getSteamImageUrl(
  iconUrlHash: string,
  size = "330x192"
): string {
  return `https://community.akamai.steamstatic.com/economy/image/${iconUrlHash}/${size}`;
}

/**
 * Build the Steam Market listing URL for an item.
 */
export function getMarketUrl(marketHashName: string): string {
  return `${STEAM_MARKET_BASE}/listings/${STEAM_APPID}/${encodeURIComponent(marketHashName)}`;
}

/**
 * Parse a Steam price string like "$1.23" or "€1,23" into a number (USD cents -> dollars).
 */
export function parseSteamPrice(priceStr: string | undefined): number | null {
  if (!priceStr) return null;
  // Remove currency symbols and whitespace, normalize comma to period
  const cleaned = priceStr.replace(/[^0-9.,]/g, "").replace(",", ".");
  const value = parseFloat(cleaned);
  return isNaN(value) ? null : value;
}
