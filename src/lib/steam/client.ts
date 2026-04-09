import type { SteamSearchResponse, SteamPriceOverview, SteamInventoryResponse, SteamVanityResponse, SteamOrderHistogram } from "./types";

const STEAM_APPID = 590830;
const STEAM_MARKET_BASE = "https://steamcommunity.com/market";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json, text/javascript, */*; q=0.01",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: `${STEAM_MARKET_BASE}/search?appid=${STEAM_APPID}`,
};

// Simple rate limiter: ensures minimum delay between requests (serialized)
class RateLimiter {
  private queue: Promise<void> = Promise.resolve();
  private minDelay: number;

  constructor(minDelayMs: number) {
    this.minDelay = minDelayMs;
  }

  async wait(): Promise<void> {
    // Chain each wait onto the previous one to serialize access
    this.queue = this.queue.then(
      () => new Promise((resolve) => setTimeout(resolve, this.minDelay))
    );
    await this.queue;
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

// ---- Steam Inventory API ----

/**
 * Parse a Steam profile URL into a SteamID64 or vanity name.
 * Handles:
 *   https://steamcommunity.com/profiles/76561198xxxxx
 *   https://steamcommunity.com/id/customname
 *   76561198xxxxx (raw steamid64)
 */
export function parseSteamProfileUrl(input: string): { steamid64?: string; vanityName?: string } | null {
  const trimmed = input.trim();

  // Raw SteamID64 (17 digits starting with 7656)
  if (/^7656\d{13}$/.test(trimmed)) {
    return { steamid64: trimmed };
  }

  try {
    const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    const path = url.pathname.replace(/\/+$/, ""); // trim trailing slashes

    // /profiles/76561198xxxxx
    const profileMatch = path.match(/\/profiles\/(7656\d{13})/);
    if (profileMatch) {
      return { steamid64: profileMatch[1] };
    }

    // /id/customname
    const idMatch = path.match(/\/id\/([^/]+)/);
    if (idMatch) {
      return { vanityName: idMatch[1] };
    }
  } catch {
    // Not a valid URL
  }

  return null;
}

/**
 * Resolve a Steam vanity URL name to a SteamID64.
 * Requires STEAM_API_KEY env var.
 */
export async function resolveVanityUrl(vanityName: string): Promise<string | null> {
  const apiKey = process.env.STEAM_API_KEY;
  if (!apiKey) {
    console.error("[steam] STEAM_API_KEY not set — cannot resolve vanity URLs");
    return null;
  }

  const params = new URLSearchParams({
    key: apiKey,
    vanityurl: vanityName,
  });

  try {
    const res = await fetch(
      `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?${params}`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as SteamVanityResponse;
    if (data.response.success === 1 && data.response.steamid) {
      return data.response.steamid;
    }
    return null;
  } catch (error) {
    console.error("[steam] Vanity URL resolution failed:", error);
    return null;
  }
}

/**
 * Fetch a user's S&box inventory. Inventory must be public.
 * Returns all items with their descriptions.
 */
export async function fetchInventory(steamid64: string): Promise<SteamInventoryResponse | null> {
  const url = `https://steamcommunity.com/inventory/${steamid64}/${STEAM_APPID}/2?l=english&count=5000`;

  // Don't use steamFetch here — inventory endpoint doesn't need the market rate limiter
  // and we want more specific error handling
  try {
    const response = await fetch(url, {
      headers: HEADERS,
      signal: AbortSignal.timeout(15000),
    });

    if (response.status === 403) {
      console.error(`[steam] Inventory is private or blocked for ${steamid64}`);
      return null;
    }

    if (!response.ok) {
      console.error(`[steam] Inventory fetch failed: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = await response.json();
    console.log(`[steam] Inventory response for ${steamid64}: success=${data.success}, assets=${data.assets?.length ?? 0}, total=${data.total_inventory_count ?? 0}`);

    // Steam returns success as either 1 (number) or true (boolean)
    if (!data.success && data.success !== 1) {
      console.error(`[steam] Inventory response not successful:`, JSON.stringify(data).slice(0, 200));
      return null;
    }

    // Normalize success to number for our type
    return { ...data, success: 1 } as SteamInventoryResponse;
  } catch (error) {
    console.error(`[steam] Inventory fetch error for ${steamid64}:`, error);
    return null;
  }
}

// ---- Steam Market Order Book ----

/**
 * Scrape the item_nameid from a Steam Market listing page.
 * This numeric ID is required for the order histogram endpoint.
 * The listing page HTML contains: Market_LoadOrderSpread( NAMEID );
 */
export async function fetchItemNameId(marketHashName: string): Promise<string | null> {
  const url = `${STEAM_MARKET_BASE}/listings/${STEAM_APPID}/${encodeURIComponent(marketHashName)}`;

  try {
    await rateLimiter.wait();
    const response = await fetch(url, {
      headers: {
        ...HEADERS,
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      console.error(`[steam] Listing page fetch failed: ${response.status} for ${marketHashName}`);
      return null;
    }

    const html = await response.text();
    const match = html.match(/Market_LoadOrderSpread\(\s*(\d+)\s*\)/);
    if (match) {
      return match[1];
    }

    console.warn(`[steam] Could not find item_nameid in listing page for ${marketHashName}`);
    return null;
  } catch (error) {
    console.error(`[steam] Failed to fetch listing page for ${marketHashName}:`, error);
    return null;
  }
}

/**
 * Fetch the buy/sell order histogram for a market item.
 * Requires the numeric item_nameid (obtained from fetchItemNameId).
 */
export async function fetchOrderHistogram(itemNameId: string): Promise<SteamOrderHistogram | null> {
  const params = new URLSearchParams({
    country: "US",
    language: "english",
    currency: "1",
    item_nameid: itemNameId,
    two_factor: "0",
  });

  return steamFetch<SteamOrderHistogram>(
    `${STEAM_MARKET_BASE}/itemordershistogram?${params}`
  );
}
