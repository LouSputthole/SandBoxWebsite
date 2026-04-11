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

  // Extract table data
  const rows = await page.$$eval("table tr", (trs) =>
    trs.slice(1).map((tr) => {
      const tds = [...tr.querySelectorAll("td")].map((td) =>
        td.textContent?.trim() ?? ""
      );
      return tds;
    })
  );

  await browser.close();

  console.log(`[scraper] Found ${rows.length} rows in table`);

  // Parse rows — we need to figure out which columns have name and supply
  // Log first few rows so we can see the structure
  if (rows.length > 0) {
    console.log("[scraper] Sample row (all columns):", JSON.stringify(rows[0]));
    if (rows.length > 1) {
      console.log("[scraper] Sample row 2:", JSON.stringify(rows[1]));
    }
  }

  // Try to find the right columns by looking at the data
  // Common patterns: name is a text column, supply is a numeric column
  const parsed: SkinRow[] = [];

  for (const row of rows) {
    if (row.length < 2) continue;

    // Find the first column that looks like a name (non-empty text, not a number)
    let name = "";
    let supply = 0;

    for (const cell of row) {
      if (!cell) continue;

      // Check if this cell is a number (potential supply value)
      const num = parseInt(cell.replace(/[,.\s]/g, ""), 10);
      if (!isNaN(num) && num > 0 && cell.match(/^[\d,.\s]+$/)) {
        // This looks like a supply number — take the largest one per row
        if (num > supply) supply = num;
      } else if (!name && cell.length > 1 && !cell.match(/^\d/)) {
        // This looks like a name
        name = cell;
      }
    }

    if (name && supply > 0) {
      parsed.push({ name, supply });
    }
  }

  console.log(`[scraper] Parsed ${parsed.length} items with supply data`);
  return parsed;
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
