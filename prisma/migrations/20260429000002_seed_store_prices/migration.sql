-- Hot-fix store prices for the current rotation while the Steam
-- IInventoryService integration is being shaken out. Every UPDATE
-- is guarded by `WHERE storePrice IS NULL` so once the daily
-- itemdef-sync cron starts populating prices automatically, this
-- file becomes a no-op (and migrations don't re-run anyway).
--
-- Source: in-game item store screenshot (2026-04-29). Cat Balaclava
-- ships with sbox.dev slug "toothpick" — verified via the sbox.dev
-- /store JSON-LD list-item url.

UPDATE "Item" SET "storePrice" = 15.00, "releasePrice" = COALESCE("releasePrice", 15.00) WHERE "slug" = 'crash-test-dummy' AND "storePrice" IS NULL;
UPDATE "Item" SET "storePrice" = 2.50,  "releasePrice" = COALESCE("releasePrice", 2.50)  WHERE "slug" = 'toothpick'         AND "storePrice" IS NULL;
UPDATE "Item" SET "storePrice" = 2.50,  "releasePrice" = COALESCE("releasePrice", 2.50)  WHERE "slug" = 'leather-coat'      AND "storePrice" IS NULL;
UPDATE "Item" SET "storePrice" = 1.50,  "releasePrice" = COALESCE("releasePrice", 1.50)  WHERE "slug" = 'lumberjack-shirt'  AND "storePrice" IS NULL;
UPDATE "Item" SET "storePrice" = 1.00,  "releasePrice" = COALESCE("releasePrice", 1.00)  WHERE "slug" = 'paper-3d-glasses'  AND "storePrice" IS NULL;
UPDATE "Item" SET "storePrice" = 4.50,  "releasePrice" = COALESCE("releasePrice", 4.50)  WHERE "slug" = 'sneakers-gravity-led-blue' AND "storePrice" IS NULL;
UPDATE "Item" SET "storePrice" = 2.00,  "releasePrice" = COALESCE("releasePrice", 2.00)  WHERE "slug" = 'sneakers-gravity'  AND "storePrice" IS NULL;
UPDATE "Item" SET "storePrice" = 2.50,  "releasePrice" = COALESCE("releasePrice", 2.50)  WHERE "slug" = 'fresh-mask'        AND "storePrice" IS NULL;
