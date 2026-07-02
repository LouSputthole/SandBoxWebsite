-- CreateTable
CREATE TABLE "UserWallet" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserWallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SellerSteamCredential" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "encryptedApiKey" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "mobileAuthConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SellerSteamCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketListing" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "steamAssetId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "priceUsd" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketOrder" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "priceUsdc" BIGINT NOT NULL,
    "feeBps" INTEGER NOT NULL DEFAULT 360,
    "escrowPda" TEXT,
    "onchainOrderId" TEXT,
    -- Public-trust-ledger proof-chain tx signatures (base58). Best-effort display links; nullable so a
    -- missing signature never blocks the money write. See src/lib/market/order-service.ts.
    "openTxSig" TEXT,
    "confirmTxSig" TEXT,
    "settleTxSig" TEXT,
    -- Per-party visibility on the public ledger (/market/ledger). Amounts + on-chain links stay public
    -- regardless; these gate only the party's Steam identity (and the delivery Steam ids when either is
    -- false). Default true.
    "buyerPublic" BOOLEAN NOT NULL DEFAULT true,
    "sellerPublic" BOOLEAN NOT NULL DEFAULT true,
    -- Initial state is PENDING: the order exists but the buyer's on-chain (buyer-signed) open_escrow
    -- tx has not confirmed yet, so no escrow exists. Funding verification promotes it to FUNDED.
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "steamAssetId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "buyerPriorAssetIds" TEXT[],
    "deliveredAssetId" TEXT,
    "deliveryDeadline" TIMESTAMP(3) NOT NULL,
    "protectionUntil" TIMESTAMP(3),
    -- Nullable + no default: set only when on-chain funding verifies (PENDING → FUNDED). A PENDING
    -- order has fundedAt = NULL.
    "fundedAt" TIMESTAMP(3),
    "sellerSentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "protectionStartedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "disputeReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeAttempt" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "tradeOfferId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "evidence" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TradeAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserWallet_userId_key" ON "UserWallet"("userId");

-- CreateIndex
CREATE INDEX "UserWallet_address_idx" ON "UserWallet"("address");

-- CreateIndex
CREATE UNIQUE INDEX "SellerSteamCredential_userId_key" ON "SellerSteamCredential"("userId");

-- CreateIndex
CREATE INDEX "MarketListing_status_idx" ON "MarketListing"("status");

-- CreateIndex
CREATE INDEX "MarketListing_sellerId_idx" ON "MarketListing"("sellerId");

-- CreateIndex
CREATE INDEX "MarketListing_itemId_idx" ON "MarketListing"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketOrder_escrowPda_key" ON "MarketOrder"("escrowPda");

-- CreateIndex
CREATE UNIQUE INDEX "MarketOrder_onchainOrderId_key" ON "MarketOrder"("onchainOrderId");

-- CreateIndex
CREATE INDEX "MarketOrder_state_idx" ON "MarketOrder"("state");

-- CreateIndex
CREATE INDEX "MarketOrder_buyerId_idx" ON "MarketOrder"("buyerId");

-- CreateIndex
CREATE INDEX "MarketOrder_sellerId_idx" ON "MarketOrder"("sellerId");

-- CreateIndex
CREATE INDEX "MarketOrder_listingId_idx" ON "MarketOrder"("listingId");

-- CreateIndex
CREATE INDEX "TradeAttempt_orderId_idx" ON "TradeAttempt"("orderId");

-- AddForeignKey
ALTER TABLE "UserWallet" ADD CONSTRAINT "UserWallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellerSteamCredential" ADD CONSTRAINT "SellerSteamCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketListing" ADD CONSTRAINT "MarketListing_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketListing" ADD CONSTRAINT "MarketListing_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketOrder" ADD CONSTRAINT "MarketOrder_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketListing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketOrder" ADD CONSTRAINT "MarketOrder_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketOrder" ADD CONSTRAINT "MarketOrder_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeAttempt" ADD CONSTRAINT "TradeAttempt_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "MarketOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Money-path integrity guards (security review 2026-07-01). Not expressible in
-- the Prisma schema (partial unique indexes + CHECK constraints), so applied as
-- raw SQL here. The app layer enforces these too; this is the DB backstop.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX "MarketListing_active_asset_unique"
  ON "MarketListing" ("steamAssetId") WHERE "status" = 'ACTIVE';
-- 'PENDING' is included so a not-yet-funded checkout still holds the per-listing lock: a second
-- buyer can't create a concurrent order for the same listing while the first buyer is signing.
-- 'FUNDING' (the fund call's claim state while the buyer's tx confirms on-chain) is included for the
-- same reason — the lock must not lapse mid-confirmation.
CREATE UNIQUE INDEX "MarketOrder_live_per_listing_unique"
  ON "MarketOrder" ("listingId")
  WHERE "state" IN ('PENDING', 'FUNDING', 'FUNDED', 'PROTECTION_HOLD', 'DISPUTED');
-- Double-spend guard #3: at most one LIVE order per physical Steam asset (complements #2, which is
-- per-listing). Stops a seller re-listing a SOLD asset to get a second concurrent escrow for one item.
-- 'PENDING'/'FUNDING' included for the same reason as above (one live order per physical asset,
-- pre-funding and mid-confirmation too).
CREATE UNIQUE INDEX "MarketOrder_live_per_asset_unique"
  ON "MarketOrder" ("steamAssetId")
  WHERE "state" IN ('PENDING', 'FUNDING', 'FUNDED', 'PROTECTION_HOLD', 'DISPUTED');
ALTER TABLE "MarketListing" ADD CONSTRAINT "MarketListing_priceUsd_nonneg" CHECK ("priceUsd" >= 0);
ALTER TABLE "MarketOrder" ADD CONSTRAINT "MarketOrder_priceUsdc_nonneg" CHECK ("priceUsdc" >= 0);
ALTER TABLE "MarketOrder" ADD CONSTRAINT "MarketOrder_feeBps_range" CHECK ("feeBps" BETWEEN 0 AND 10000);
ALTER TABLE "MarketOrder" ADD CONSTRAINT "MarketOrder_no_self_deal" CHECK ("buyerId" <> "sellerId");


-- ---------------------------------------------------------------------------
-- Phase 2 — public profiles: buyer's rating of a seller after a RELEASED order.
-- One review per order (unique orderId) so rep is always backed by a real,
-- escrow-settled trade. stars is CHECK-constrained to 1..5 (Prisma can't express
-- it in-schema). See src/lib/market/review-service.ts.
-- ---------------------------------------------------------------------------
CREATE TABLE "MarketReview" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "raterId" TEXT NOT NULL,
    "ratedId" TEXT NOT NULL,
    "stars" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MarketReview_orderId_key" ON "MarketReview"("orderId");

-- CreateIndex
CREATE INDEX "MarketReview_ratedId_createdAt_idx" ON "MarketReview"("ratedId", "createdAt");

-- CreateIndex
CREATE INDEX "MarketReview_raterId_idx" ON "MarketReview"("raterId");

-- AddForeignKey
ALTER TABLE "MarketReview" ADD CONSTRAINT "MarketReview_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "MarketOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketReview" ADD CONSTRAINT "MarketReview_raterId_fkey" FOREIGN KEY ("raterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketReview" ADD CONSTRAINT "MarketReview_ratedId_fkey" FOREIGN KEY ("ratedId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Star rating must be 1..5 (app validates too; this is the DB backstop).
ALTER TABLE "MarketReview" ADD CONSTRAINT "MarketReview_stars_range" CHECK ("stars" BETWEEN 1 AND 5);


-- ---------------------------------------------------------------------------
-- Marketplace ban list (TOS enforcement — "ban a Steam id + wallet"). A ban
-- carries a steamId and/or a walletAddress and is ACTIVE while "liftedAt" IS
-- NULL. The partial-unique indexes make a re-ban of an already-ACTIVE identifier
-- idempotent at the DB level (the app upsert-guards too). The CHECK guarantees at
-- least one identifier is present. See src/lib/market/bans.ts.
-- ---------------------------------------------------------------------------
CREATE TABLE "MarketBan" (
    "id" TEXT NOT NULL,
    "steamId" TEXT,
    "walletAddress" TEXT,
    "reason" TEXT NOT NULL,
    "bannedByKeyType" TEXT NOT NULL,
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "liftedAt" TIMESTAMP(3),

    CONSTRAINT "MarketBan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MarketBan_steamId_idx" ON "MarketBan"("steamId");

-- CreateIndex
CREATE INDEX "MarketBan_walletAddress_idx" ON "MarketBan"("walletAddress");

-- At most one ACTIVE ban per identifier (idempotent re-ban; the service guards
-- too). Partial on liftedAt IS NULL so a lifted ban never blocks a fresh one, and
-- on <col> IS NOT NULL so single-identifier bans don't collide on a shared NULL.
CREATE UNIQUE INDEX "MarketBan_active_steamId_unique"
  ON "MarketBan" ("steamId") WHERE "liftedAt" IS NULL AND "steamId" IS NOT NULL;
CREATE UNIQUE INDEX "MarketBan_active_walletAddress_unique"
  ON "MarketBan" ("walletAddress") WHERE "liftedAt" IS NULL AND "walletAddress" IS NOT NULL;

-- A ban must name at least one identifier (app enforces this too).
ALTER TABLE "MarketBan" ADD CONSTRAINT "MarketBan_identifier_present"
  CHECK ("steamId" IS NOT NULL OR "walletAddress" IS NOT NULL);

-- Provenance link to the order that triggered a quick-ban. SET NULL (not CASCADE)
-- so a rolled-back PENDING order never takes the ban row with it — ban history
-- outlives the order. The match identifiers deliberately carry NO such FK.
ALTER TABLE "MarketBan" ADD CONSTRAINT "MarketBan_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "MarketOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
