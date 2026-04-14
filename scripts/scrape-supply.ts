/**
 * Scrape S&box skin supply data from sbox.game/metrics/skins
 *
 * This page is a Blazor Server app (SignalR), so we need a headless browser.
 *
 * Setup:
 *   npm install -D playwright
 *   npx playwright install chromium
 *
 * Run:
 *   npx tsx scripts/scrape-supply.ts
 *
 * Options:
 *   --dry-run    Print scraped data without updating the database
 *   --api-url    API URL to POST supply data to (default: http://localhost:3000/api/sync/supply)
 */

import { chromium } from "playwright";

const API_URL =
  process.argv.find((a) => a.startsWith("--api-url="))?.split("=")[1] ??
  "http://localhost:3000/api/sync/supply";

const DRY_RUN = process.argv.includes("--dry-run");

interface SkinRow {
  name: string;
  supply: number;
}

async function scrapeSkinSupply(): Promise<SkinRow[]> {
  console.log("[scraper] Launching browser...");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  console.log("[scraper] Navigating to sbox.game/metrics/skins...");
  await page.goto("https://sbox.game/metrics/skins", {
    waitUntil: "networkidle",
    timeout: 60000,
  });

  // Wait for the table to render (Blazor takes time to hydrate)
  console.log("[scraper] Waiting for table to render...");
  await page.waitForSelector("table", { timeout: 30000 });

  // Give Blazor a moment to finish rendering all rows
  await page.waitForTimeout(3000);

  // Scroll to load any lazy-loaded content — repeat several times
  console.log("[scraper] Scrolling to load all items...");
  let previousRowCount = 0;
  for (let i = 0; i < 10; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1500);

    // Check for "load more" / "show all" buttons and click them
    const loadMore = await page.$('button:has-text("Load More"), button:has-text("Show All"), button:has-text("Show more"), a:has-text("Load More"), a:has-text("Show All"), [class*="load-more"], [class*="show-all"], [class*="pagination"] button');
    if (loadMore) {
      console.log("[scraper] Found 'load more' button, clicking...");
      await loadMore.click();
      await page.waitForTimeout(2000);
    }

    const currentRowCount = await page.$$eval("table tr", (trs) => trs.length);
    if (currentRowCount === previousRowCount && i > 0) {
      console.log(`[scraper] Row count stable at ${currentRowCount} after scroll ${i + 1}`);
      break;
    }
    previousRowCount = currentRowCount;
  }

  // Check for pagination — click through all pages
  let pageNum = 1;
  while (true) {
    const nextBtn = await page.$('button:has-text("Next"), a:has-text("Next"), [aria-label="Next page"], .pagination .next:not(.disabled)');
    if (!nextBtn) break;
    console.log(`[scraper] Clicking to page ${++pageNum}...`);
    await nextBtn.click();
    await page.waitForTimeout(2000);
  }

  // Count all tables on the page
  const tableCount = await page.$$eval("table", (tables) => tables.length);
  console.log(`[scraper] Found ${tableCount} table(s) on page`);

  // Extract data from ALL tables, log headers to understand structure
  const allRows: string[][] = [];
  const tableInfo = await page.$$eval("table", (tables) => {
    return tables.map((table, idx) => {
      const headers = [...table.querySelectorAll("th")].map((th) => th.textContent?.trim() ?? "");
      const rows = [...table.querySelectorAll("tbody tr, tr")].slice(headers.length > 0 ? 0 : 1);
      const data = rows.map((tr) =>
        [...tr.querySelectorAll("td")].map((td) => td.textContent?.trim() ?? "")
      ).filter((r) => r.length >= 2);
      return { index: idx, headers, rowCount: data.length, data };
    });
  });

  for (const info of tableInfo) {
    console.log(`[scraper] Table ${info.index}: headers=[${info.headers.join(", ")}], rows=${info.rowCount}`);
    if (info.data.length > 0) {
      console.log(`[scraper]   Sample: ${JSON.stringify(info.data[0])}`);
    }
    allRows.push(...info.data);
  }

  await browser.close();

  console.log(`[scraper] Total rows across all tables: ${allRows.length}`);

  // Parse rows — detect name and supply columns
  const parsed: SkinRow[] = [];

  for (const row of allRows) {
    if (row.length < 2) continue;

    let name = "";
    let supply = 0;

    for (const cell of row) {
      if (!cell) continue;

      // Check if this cell is a pure number (potential supply value)
      const cleaned = cell.replace(/[,\s]/g, "");
      const num = parseInt(cleaned, 10);
      if (!isNaN(num) && num > 0 && /^[\d,\s]+$/.test(cell)) {
        // Take the LAST (rightmost) numeric column as supply
        // since tables usually go: Name | Value | Supply
        supply = num;
      } else if (!name && cell.length > 1 && !/^\d/.test(cell) && !/^\$/.test(cell)) {
        // First non-numeric, non-currency cell is the name
        name = cell;
      }
    }

    if (name && supply > 0) {
      parsed.push({ name, supply });
    }
  }

  // Deduplicate — keep the entry with the HIGHEST supply per name
  const deduped = new Map<string, SkinRow>();
  for (const item of parsed) {
    const key = item.name.toLowerCase();
    const existing = deduped.get(key);
    if (!existing || item.supply > existing.supply) {
      deduped.set(key, item);
    }
  }

  const result = [...deduped.values()];
  console.log(`[scraper] Parsed ${parsed.length} rows -> ${result.length} unique items (after dedup)`);
  return result;
}

async function postSupplyData(items: SkinRow[]) {
  console.log(`[scraper] POSTing supply data to ${API_URL}...`);

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.CRON_SECRET) {
    headers["Authorization"] = `Bearer ${process.env.CRON_SECRET}`;
  }

  const res = await fetch(API_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ items }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`[scraper] API error ${res.status}: ${text}`);
    return;
  }

  const result = await res.json();
  console.log("[scraper] API response:", JSON.stringify(result, null, 2));
}

async function main() {
  const items = await scrapeSkinSupply();

  if (items.length === 0) {
    console.log("[scraper] No data scraped. The page structure may have changed.");
    console.log("[scraper] Run with a visible browser to debug:");
    console.log("  Edit the script to set headless: false");
    return;
  }

  // Print results
  console.log("\n--- Scraped Supply Data ---");
  for (const item of items) {
    console.log(`  ${item.name}: ${item.supply.toLocaleString()}`);
  }
  console.log(`\nTotal: ${items.length} items`);

  if (DRY_RUN) {
    console.log("\n[scraper] Dry run — not sending to API");
    return;
  }

  await postSupplyData(items);
}

main().catch((err) => {
  console.error("[scraper] Fatal error:", err);
  process.exit(1);
});
