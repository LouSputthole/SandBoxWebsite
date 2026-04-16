-- Trade bulletin board: listings, line items, and User.steamTradeUrl

ALTER TABLE "User" ADD COLUMN "steamTradeUrl" TEXT;

CREATE TABLE "TradeListing" (
  "id"          TEXT NOT NULL,
  "userId"      TEXT NOT NULL,
  "side"        TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "status"      TEXT NOT NULL DEFAULT 'active',
  "viewCount"   INTEGER NOT NULL DEFAULT 0,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TradeListing_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TradeListing_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "TradeListing_status_createdAt_idx" ON "TradeListing"("status", "createdAt");
CREATE INDEX "TradeListing_status_expiresAt_idx" ON "TradeListing"("status", "expiresAt");
CREATE INDEX "TradeListing_userId_status_idx" ON "TradeListing"("userId", "status");
CREATE INDEX "TradeListing_side_status_idx" ON "TradeListing"("side", "status");

CREATE TABLE "TradeListingItem" (
  "id"                 TEXT NOT NULL,
  "listingId"          TEXT NOT NULL,
  "slot"               TEXT NOT NULL,
  "itemId"             TEXT,
  "customName"         TEXT,
  "quantity"           INTEGER NOT NULL DEFAULT 1,
  "unitPriceAtListing" DOUBLE PRECISION,
  CONSTRAINT "TradeListingItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TradeListingItem_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "TradeListing"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TradeListingItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "TradeListingItem_listingId_idx" ON "TradeListingItem"("listingId");
CREATE INDEX "TradeListingItem_itemId_idx" ON "TradeListingItem"("itemId");
