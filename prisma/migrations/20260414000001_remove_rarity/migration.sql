-- DropIndex
DROP INDEX IF EXISTS "Item_rarity_idx";

-- AlterTable: remove rarity column
ALTER TABLE "Item" DROP COLUMN IF EXISTS "rarity";
