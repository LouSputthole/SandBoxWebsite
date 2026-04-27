-- Backfill `storePrice` from `releasePrice` for any item where the
-- legacy column is null. sbox.dev populates releasePrice reliably; the
-- scraped storePrice has been spotty since the scraper's CSS selectors
-- frequently miss the price element on sbox.game. Going forward, the
-- sync service mirrors releasePrice into storePrice on every refresh.
UPDATE "Item"
SET "storePrice" = "releasePrice"
WHERE "storePrice" IS NULL
  AND "releasePrice" IS NOT NULL;
