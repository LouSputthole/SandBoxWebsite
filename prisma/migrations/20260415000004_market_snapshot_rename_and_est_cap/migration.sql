-- Rename MarketSnapshot.marketCap → listingsValue (it was always this semantically).
ALTER TABLE "MarketSnapshot" RENAME COLUMN "marketCap" TO "listingsValue";

-- Add new estMarketCap column for the supply-based actual market cap estimate.
ALTER TABLE "MarketSnapshot" ADD COLUMN "estMarketCap" DOUBLE PRECISION;
