-- Scarcity score on Item
ALTER TABLE "Item" ADD COLUMN "scarcityScore" DOUBLE PRECISION;

-- Historical supply snapshots per item
CREATE TABLE "SupplySnapshot" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "totalSupply" INTEGER NOT NULL,
    "uniqueOwners" INTEGER,
    "price" DOUBLE PRECISION,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupplySnapshot_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SupplySnapshot_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "SupplySnapshot_itemId_timestamp_idx" ON "SupplySnapshot"("itemId", "timestamp");

-- Blog posts
CREATE TABLE "BlogPost" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "kind" TEXT,
    "coverImage" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BlogPost_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BlogPost_slug_key" ON "BlogPost"("slug");
CREATE INDEX "BlogPost_publishedAt_idx" ON "BlogPost"("publishedAt");
CREATE INDEX "BlogPost_kind_idx" ON "BlogPost"("kind");

-- PriceAlert: add discord webhook, make email optional
ALTER TABLE "PriceAlert" ADD COLUMN "discordWebhook" TEXT;
ALTER TABLE "PriceAlert" ALTER COLUMN "email" DROP NOT NULL;
