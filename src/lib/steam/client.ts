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

// 1.5-second delay between requests to respect Steam rate limits
const rateLimiter = new RateLimiter(1500);

/**
 * Fetch a URL from Steam with proper headers, rate limiting, and retry.
 * Returns null on failure instead of throwing.
 */
async function steamFetch<T>(url: string, retries = 2): Promise<T | null> {
  await rateLimiter.wait();

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: HEADERS,
        signal: AbortSignal.timeout(15000),
      });

      if (response.status === 429) {
        // Rate limited — back off exponentially
        const delay = 5000 * Math.pow(2, attempt);
        console.warn(`[steam] Rate limited, retrying in ${delay}ms (attempt ${attempt + 1})`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      if (!response.ok) {
        console.error(
          `Steam API error: ${response.status} ${response.statusText} for ${url}`
        );
        return null;
      }

      return (await response.json()) as T;
    } catch (error) {
      if (attempt < retries) {
        const delay = 2000 * Math.pow(2, attempt);
        console.warn(`[steam] Fetch failed, retrying in ${delay}ms (attempt ${attempt + 1}):`, error);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      console.error(`Steam API fetch failed for ${url}:`, error);
      return null;
    }
  }
  return null;
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
 * Steam may return fewer items per page than requested (rate throttling),
 * so we paginate based on total_count rather than page size.
 */
export async function fetchAllMarketItems(): Promise<SteamSearchResponse["results"]> {
  const allItems: SteamSearchResponse["results"] = [];
  let start = 0;
  const count = 100;
  let totalCount = Infinity;
  let emptyPages = 0;

  while (allItems.length < totalCount) {
    console.log(`[steam] Fetching items ${start}–${start + count} (have ${allItems.length}/${totalCount === Infinity ? "?" : totalCount})...`);
    const response = await searchMarketItems(start, count);

    if (!response || !response.success) {
      console.warn("[steam] Search request failed, stopping pagination");
      break;
    }

    // Update total count from Steam's response
    if (response.total_count !== undefined) {
      totalCount = response.total_count;
      console.log(`[steam] Steam reports ${totalCount} total items`);
    }

    if (!response.results || response.results.length === 0) {
      emptyPages++;
      if (emptyPages >= 3) {
        console.warn("[steam] Got 3 empty pages in a row, stopping");
        break;
      }
      // Steam might be throttling — wait longer and retry same offset
      console.warn(`[steam] Empty page at start=${start}, waiting 10s before retry...`);
      await new Promise((r) => setTimeout(r, 10000));
      continue;
    }

    emptyPages = 0;
    allItems.push(...response.results);

    // Move to next page
    start += response.results.length;

    // Safety: don't loop forever
    if (start >= totalCount) break;
  }

  console.log(`[steam] Pagination complete: fetched ${allItems.length} of ${totalCount === Infinity ? "unknown" : totalCount} items`);
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
