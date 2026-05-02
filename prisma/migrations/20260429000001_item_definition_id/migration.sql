-- Steam IInventoryService itemdefid surface. Lets us key into
-- Steamworks' authoritative item-def archive for store pricing
-- and other catalog metadata that sbox.dev's per-skin API often
-- returns as null (especially for brand-new drops).

ALTER TABLE "Item" ADD COLUMN "itemDefinitionId" INTEGER;

CREATE INDEX "Item_itemDefinitionId_idx" ON "Item"("itemDefinitionId");
