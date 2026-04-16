-- sbox.dev enrichment fields
ALTER TABLE "Item" ADD COLUMN "releaseDate" TIMESTAMP(3);
ALTER TABLE "Item" ADD COLUMN "releasePrice" DOUBLE PRECISION;
ALTER TABLE "Item" ADD COLUMN "uniqueOwners" INTEGER;
ALTER TABLE "Item" ADD COLUMN "soldPast24h" INTEGER;
ALTER TABLE "Item" ADD COLUMN "supplyOnMarket" INTEGER;
ALTER TABLE "Item" ADD COLUMN "totalSales" INTEGER;
ALTER TABLE "Item" ADD COLUMN "isActiveStoreItem" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Item" ADD COLUMN "isPermanentStoreItem" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Item" ADD COLUMN "leavingStoreAt" TIMESTAMP(3);
ALTER TABLE "Item" ADD COLUMN "itemDisplayName" TEXT;
ALTER TABLE "Item" ADD COLUMN "category" TEXT;
ALTER TABLE "Item" ADD COLUMN "itemSubType" TEXT;
ALTER TABLE "Item" ADD COLUMN "workshopId" TEXT;
ALTER TABLE "Item" ADD COLUMN "priceChange6h" DOUBLE PRECISION;
ALTER TABLE "Item" ADD COLUMN "priceChange6hPercent" DOUBLE PRECISION;
ALTER TABLE "Item" ADD COLUMN "iconBackgroundColor" TEXT;
ALTER TABLE "Item" ADD COLUMN "topHolders" JSONB;

CREATE INDEX "Item_isActiveStoreItem_idx" ON "Item"("isActiveStoreItem");
