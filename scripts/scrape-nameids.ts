/**
 * Scrape Steam item_nameid values for all items in the database.
 *
 * These numeric IDs are required for the order histogram endpoint.
 * Steam blocks HTML page scraping from Vercel's data center IPs,
 * so this script must be run from a local machine.
 *
 * Setup:
 *   Copy .env with DATABASE_URL to local machine
 *
 * Run:
 *   npx tsx scripts/scrape-nameids.ts
 *
 * Options:
 *   --dry-run     Print what would be updated without writing to DB
 *   --force       Re-scrape items that already have a steamItemNameId
 */

import "dotenv/config";

const STEAM_APPID = 590830;
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml",
  "Accept-Language": "en-US,en;q=0.9",
};

const DRY_RUN = process.argv.includes("--dry-run");
const FORCE = process.argv.includes("--force");

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function scrapeItemNameId(marketHashName: string): Promise<string | null> {
  const url = `https://steamcommunity.com/market/listings/${STEAM_APPID}/${encodeURIComponent(marketHashName)}`;

  const response = await fetch(url, {
    headers: HEADERS,
    signal: AbortSignal.timeout(15000),
  });

  if (response.status === 429) {
    console.warn(`  [429] Rate limited, waiting 30s...`);
    await sleep(30000);
    return scrapeItemNameId(marketHashName); // retry
  }

  if (!response.ok) {
    console.error(`  [${response.status}] Failed for ${marketHashName}`);
    return null;
  }

  const html = await response.text();
  const match = html.match(/Market_LoadOrderSpread\(\s*(\d+)\s*\)/);
  return match ? match[1] : null;
}

async function main() {
  // Dynamic import to handle prisma connection
  const { PrismaClient } = await import("../src/generated/prisma/client.js");
  const prisma = new PrismaClient();

  try {
    const where = FORCE
      ? { steamMarketId: { not: null } }
      : { steamMarketId: { not: null }, steamItemNameId: null };

    const items = await prisma.item.findMany({
      where,
      select: { id: true, name: true, steamMarketId: true, steamItemNameId: true },
      orderBy: { name: "asc" },
    });

    console.log(`Found ${items.length} items to process${FORCE ? " (force mode)" : ""}${DRY_RUN ? " (dry run)" : ""}\n`);

    let updated = 0;
    let failed = 0;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      console.log(`[${i + 1}/${items.length}] ${item.name} (${item.steamMarketId})`);

      if (item.steamItemNameId && !FORCE) {
        console.log(`  Already has nameId: ${item.steamItemNameId}, skipping`);
        continue;
      }

      const nameId = await scrapeItemNameId(item.steamMarketId!);

      if (nameId) {
        console.log(`  Found nameId: ${nameId}`);
        if (!DRY_RUN) {
          await prisma.item.update({
            where: { id: item.id },
            data: { steamItemNameId: nameId },
          });
        }
        updated++;
      } else {
        console.log(`  Failed to find nameId`);
        failed++;
      }

      // Rate limit: 2s between requests
      if (i < items.length - 1) {
        await sleep(2000);
      }
    }

    console.log(`\nDone! Updated: ${updated}, Failed: ${failed}`);
    if (DRY_RUN) console.log("(Dry run — no changes written to DB)");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
