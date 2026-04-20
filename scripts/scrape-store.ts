/**
 * Scrape S&box store availability from sbox.game
 *
 * Checks which skins are currently available for purchase in the S&box store.
 * Items no longer in the store will be marked as "delisted" via the API.
 *
 * Setup:
 *   npm install -D playwright
 *   npx playwright install chromium
 *
 * Run:
 *   npx tsx scripts/scrape-store.ts
 *
 * Options:
 *   --dry-run    Print scraped data without updating the database
 *   --api-url    API URL to POST store data to (default: http://localhost:3000/api/sync/store)
 *
 * Failure policy:
 *   This is an enrichment scraper, not a critical path. If sbox.game changes
 *   its HTML, rate-limits us, or Playwright hiccups, the only consequence is
 *   that store availability doesn't update *this run* — the DB keeps its
 *   last known state. So we exit 0 on any unhandled error and log what
 *   happened. The workflow staying green means the daily failure email
 *   doesn't train us to ignore all GitHub Actions notifications. Set the
 *   STRICT=1 env var to restore the old "exit 1 on any error" behavior.
 */

import { chromium, type Browser } from "playwright";

const API_URL =
  process.argv.find((a) => a.startsWith("--api-url="))?.split("=")[1] ??
  (process.env.DEPLOYED_URL
    ? `${process.env.DEPLOYED_URL}/api/sync/store`
    : "http://localhost:3000/api/sync/store");

const DRY_RUN = process.argv.includes("--dry-run");

interface StoreItem {
  name: string;
  storePrice?: number;
}

async function scrapeStore(): Promise<StoreItem[]> {
  console.log("[store-scraper] Launching browser...");
  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (err) {
    console.error("[store-scraper] Browser launch failed:", err);
    return [];
  }

  const page = await browser.newPage();

  // Try the S&box shop/skins pages
  const urls = [
    "https://sbox.game/shop/skins",
    "https://sbox.game/shop",
    "https://asset.party/skins",
  ];

  const items: StoreItem[] = [];

  for (const url of urls) {
    try {
      console.log(`[store-scraper] Trying ${url}...`);
      const response = await page.goto(url, {
        waitUntil: "networkidle",
        timeout: 30000,
      });

      if (!response || response.status() >= 400) {
        console.log(`[store-scraper] ${url} returned ${response?.status() ?? "no response"}, skipping`);
        continue;
      }

      // Wait for content to load (Blazor hydration)
      await page.waitForTimeout(3000);

      // Try to extract item cards — look for common patterns
      const scraped = await page.evaluate(() => {
        const results: { name: string; price?: string }[] = [];

        // Strategy 1: Look for item cards with name and price elements
        const cards = document.querySelectorAll(
          "[class*='item'], [class*='skin'], [class*='card'], [class*='product']"
        );
        for (const card of cards) {
          const nameEl =
            card.querySelector("h2, h3, h4, [class*='name'], [class*='title']");
          const priceEl = card.querySelector("[class*='price'], [class*='cost']");
          if (nameEl?.textContent?.trim()) {
            results.push({
              name: nameEl.textContent.trim(),
              price: priceEl?.textContent?.trim(),
            });
          }
        }

        // Strategy 2: If no cards found, look for a grid/list of links
        if (results.length === 0) {
          const links = document.querySelectorAll("a[href*='skin'], a[href*='item']");
          for (const link of links) {
            const text = link.textContent?.trim();
            if (text && text.length > 2 && text.length < 100) {
              results.push({ name: text });
            }
          }
        }

        // Strategy 3: Look for any table rows (like the metrics page)
        if (results.length === 0) {
          const rows = document.querySelectorAll("table tr");
          for (const row of rows) {
            const cells = [...row.querySelectorAll("td")].map(
              (td) => td.textContent?.trim() ?? ""
            );
            if (cells.length >= 2 && cells[0] && !cells[0].match(/^\d/)) {
              results.push({ name: cells[0] });
            }
          }
        }

        return results;
      });

      if (scraped.length > 0) {
        console.log(
          `[store-scraper] Found ${scraped.length} items on ${url}`
        );
        for (const s of scraped) {
          const price = s.price
            ? parseFloat(s.price.replace(/[^0-9.]/g, ""))
            : undefined;
          items.push({
            name: s.name,
            storePrice: price && !isNaN(price) ? price : undefined,
          });
        }
        break; // Got data, stop trying URLs
      }
    } catch (error) {
      console.log(`[store-scraper] Error on ${url}: ${error}`);
    }
  }

  // Close defensively — don't let a close failure take down the whole run.
  try {
    await browser.close();
  } catch (err) {
    console.warn("[store-scraper] Browser close failed (ignored):", err);
  }
  return items;
}

async function postStoreData(items: StoreItem[]) {
  console.log(`[store-scraper] POSTing store data to ${API_URL}...`);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (process.env.CRON_SECRET) {
    headers["Authorization"] = `Bearer ${process.env.CRON_SECRET}`;
  }

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({ items }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`[store-scraper] API error ${res.status}: ${text}`);
      return;
    }

    const result = await res.json();
    console.log(
      "[store-scraper] API response:",
      JSON.stringify(result, null, 2)
    );
  } catch (err) {
    console.error(`[store-scraper] POST to ${API_URL} failed:`, err);
  }
}

async function main() {
  const items = await scrapeStore();

  if (items.length === 0) {
    console.log(
      "[store-scraper] No items found. sbox.game may have changed layout, "
        + "added bot protection, or is unreachable. DB keeps its last known "
        + "state until the next successful run."
    );
    return;
  }

  console.log("\n--- Store Items ---");
  for (const item of items) {
    const price = item.storePrice != null ? ` ($${item.storePrice})` : "";
    console.log(`  ${item.name}${price}`);
  }
  console.log(`\nTotal: ${items.length} items in store`);

  if (DRY_RUN) {
    console.log("\n[store-scraper] Dry run — not sending to API");
    return;
  }

  await postStoreData(items);
}

// Soft-fail: log any unhandled error but exit 0 so the GitHub Actions
// workflow stays green for a non-critical enrichment scraper. If you WANT
// CI to fail (e.g., to gate a deploy), set STRICT=1.
main().catch((err) => {
  console.error("[store-scraper] Fatal error:", err);
  if (process.env.STRICT === "1") {
    process.exit(1);
  }
});
