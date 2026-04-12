-- AlterTable: Add store tracking fields to Item
ALTER TABLE "Item" ADD COLUMN "storeStatus" TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE "Item" ADD COLUMN "delistedAt" TIMESTAMP(3);
ALTER TABLE "Item" ADD COLUMN "storePrice" DOUBLE PRECISION;

-- CreateIndex
CREATE INDEX "Item_storeStatus_idx" ON "Item"("storeStatus");

-- CreateTable
CREATE TABLE "MarketSnapshot" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalItems" INTEGER NOT NULL,
    "marketCap" DOUBLE PRECISION NOT NULL,
    "avgPrice" DOUBLE PRECISION NOT NULL,
    "medianPrice" DOUBLE PRECISION,
    "totalVolume" INTEGER NOT NULL,
    "totalSupply" INTEGER,
    "floor" DOUBLE PRECISION,
    "ceiling" DOUBLE PRECISION,

    CONSTRAINT "MarketSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MarketSnapshot_timestamp_idx" ON "MarketSnapshot"("timestamp");
