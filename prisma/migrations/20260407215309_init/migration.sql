-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL,
    "steamMarketId" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "rarity" TEXT,
    "imageUrl" TEXT,
    "marketUrl" TEXT,
    "currentPrice" DOUBLE PRECISION,
    "lowestPrice" DOUBLE PRECISION,
    "medianPrice" DOUBLE PRECISION,
    "volume" INTEGER DEFAULT 0,
    "priceChange24h" DOUBLE PRECISION DEFAULT 0,
    "isLimited" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricePoint" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "volume" INTEGER DEFAULT 0,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PricePoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Item_steamMarketId_key" ON "Item"("steamMarketId");

-- CreateIndex
CREATE UNIQUE INDEX "Item_slug_key" ON "Item"("slug");

-- CreateIndex
CREATE INDEX "Item_type_idx" ON "Item"("type");

-- CreateIndex
CREATE INDEX "Item_rarity_idx" ON "Item"("rarity");

-- CreateIndex
CREATE INDEX "Item_currentPrice_idx" ON "Item"("currentPrice");

-- CreateIndex
CREATE INDEX "PricePoint_itemId_timestamp_idx" ON "PricePoint"("itemId", "timestamp");

-- AddForeignKey
ALTER TABLE "PricePoint" ADD CONSTRAINT "PricePoint_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
