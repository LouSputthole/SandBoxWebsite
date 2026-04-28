-- Phase 2 of CSFloat-style trade facilitation: crypto escrow.
-- Five new models. Bot credentials live in env vars, not the DB.

CREATE TABLE "EscrowBotAccount" (
    "id" TEXT NOT NULL,
    "steamId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "maxConcurrentTrades" INTEGER NOT NULL DEFAULT 20,
    "lastHealthcheckAt" TIMESTAMP(3),
    "lastHealthcheckOk" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EscrowBotAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EscrowBotAccount_steamId_key" ON "EscrowBotAccount"("steamId");
CREATE INDEX "EscrowBotAccount_status_idx" ON "EscrowBotAccount"("status");

CREATE TABLE "EscrowTrade" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "itemSnapshot" JSONB NOT NULL,
    "priceUsd" DOUBLE PRECISION NOT NULL,
    "priceCryptoCurrency" TEXT,
    "priceCryptoAmount" TEXT,
    "feeUsd" DOUBLE PRECISION NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'pending_deposit',
    "botAccountId" TEXT,
    "depositTradeOfferId" TEXT,
    "releaseTradeOfferId" TEXT,
    "refundTradeOfferId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "depositedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "disputedAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "depositDeadline" TIMESTAMP(3) NOT NULL,
    "paymentDeadline" TIMESTAMP(3),

    CONSTRAINT "EscrowTrade_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EscrowTrade_buyerId_state_idx" ON "EscrowTrade"("buyerId", "state");
CREATE INDEX "EscrowTrade_sellerId_state_idx" ON "EscrowTrade"("sellerId", "state");
CREATE INDEX "EscrowTrade_state_createdAt_idx" ON "EscrowTrade"("state", "createdAt");
CREATE INDEX "EscrowTrade_listingId_idx" ON "EscrowTrade"("listingId");

ALTER TABLE "EscrowTrade"
    ADD CONSTRAINT "EscrowTrade_listingId_fkey"
    FOREIGN KEY ("listingId") REFERENCES "TradeListing"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EscrowTrade"
    ADD CONSTRAINT "EscrowTrade_buyerId_fkey"
    FOREIGN KEY ("buyerId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EscrowTrade"
    ADD CONSTRAINT "EscrowTrade_sellerId_fkey"
    FOREIGN KEY ("sellerId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EscrowTrade"
    ADD CONSTRAINT "EscrowTrade_botAccountId_fkey"
    FOREIGN KEY ("botAccountId") REFERENCES "EscrowBotAccount"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "BotInventoryItem" (
    "id" TEXT NOT NULL,
    "botAccountId" TEXT NOT NULL,
    "steamAssetId" TEXT NOT NULL,
    "marketHashName" TEXT NOT NULL,
    "itemSlug" TEXT,
    "reservedForTradeId" TEXT,
    "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BotInventoryItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BotInventoryItem_botAccountId_steamAssetId_key"
    ON "BotInventoryItem"("botAccountId", "steamAssetId");
CREATE INDEX "BotInventoryItem_botAccountId_reservedForTradeId_idx"
    ON "BotInventoryItem"("botAccountId", "reservedForTradeId");

ALTER TABLE "BotInventoryItem"
    ADD CONSTRAINT "BotInventoryItem_botAccountId_fkey"
    FOREIGN KEY ("botAccountId") REFERENCES "EscrowBotAccount"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "tradeId" TEXT NOT NULL,
    "processor" TEXT NOT NULL,
    "processorChargeId" TEXT NOT NULL,
    "hostedUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "amountSettled" TEXT,
    "currencySettled" TEXT,
    "webhookEvents" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Payment_tradeId_key" ON "Payment"("tradeId");
CREATE UNIQUE INDEX "Payment_processorChargeId_key" ON "Payment"("processorChargeId");
CREATE INDEX "Payment_status_createdAt_idx" ON "Payment"("status", "createdAt");

ALTER TABLE "Payment"
    ADD CONSTRAINT "Payment_tradeId_fkey"
    FOREIGN KEY ("tradeId") REFERENCES "EscrowTrade"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Dispute" (
    "id" TEXT NOT NULL,
    "tradeId" TEXT NOT NULL,
    "openedBy" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "resolution" TEXT,
    "resolutionNote" TEXT,
    "resolvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Dispute_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Dispute_tradeId_key" ON "Dispute"("tradeId");
CREATE INDEX "Dispute_resolvedAt_createdAt_idx"
    ON "Dispute"("resolvedAt", "createdAt");

ALTER TABLE "Dispute"
    ADD CONSTRAINT "Dispute_tradeId_fkey"
    FOREIGN KEY ("tradeId") REFERENCES "EscrowTrade"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
