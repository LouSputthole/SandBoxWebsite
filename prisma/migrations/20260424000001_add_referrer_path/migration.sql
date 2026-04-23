-- Add a nullable referrerPath column to PageView so we can see which
-- specific external URLs are sending traffic (e.g. which steamcommunity.com
-- page is linking to us). The normalized `referrer` column stays
-- untouched so the main top-referrers aggregation keeps working.

ALTER TABLE "PageView" ADD COLUMN "referrerPath" TEXT;
