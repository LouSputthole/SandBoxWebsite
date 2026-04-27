-- Public comment thread on TradeListing rows. Steam-OAuth gate enforced
-- in the API; soft-delete via deletedAt so admin moderation has audit
-- trail and reply context doesn't get re-orphaned by deletes.

CREATE TABLE "TradeComment" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,

    CONSTRAINT "TradeComment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TradeComment_listingId_createdAt_idx"
    ON "TradeComment"("listingId", "createdAt");
CREATE INDEX "TradeComment_userId_idx"
    ON "TradeComment"("userId");

ALTER TABLE "TradeComment"
    ADD CONSTRAINT "TradeComment_listingId_fkey"
    FOREIGN KEY ("listingId") REFERENCES "TradeListing"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TradeComment"
    ADD CONSTRAINT "TradeComment_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
