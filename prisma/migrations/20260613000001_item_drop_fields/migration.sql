-- AlterTable: drop-item fields from sbox.dev (random in-game drops vs store buys)
ALTER TABLE "Item" ADD COLUMN "isDroppableItem" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Item" ADD COLUMN "droppedUnits" INTEGER;
ALTER TABLE "Item" ADD COLUMN "rarity" TEXT;
