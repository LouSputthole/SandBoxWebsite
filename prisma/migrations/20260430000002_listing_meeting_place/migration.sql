-- Trade-listing meetingPlace column. Three values:
--   "steam_trade"  — Steam trade offer flow (existing behavior)
--   "trading_hub"  — meet at the S&box Trading Hub partner space
--   "either"       — both options offered
-- Existing rows get the default "steam_trade" so legacy listings
-- continue to render the original "Open trade on Steam" CTA.

ALTER TABLE "TradeListing"
    ADD COLUMN "meetingPlace" TEXT DEFAULT 'steam_trade';

CREATE INDEX "TradeListing_meetingPlace_status_idx"
    ON "TradeListing"("meetingPlace", "status");
