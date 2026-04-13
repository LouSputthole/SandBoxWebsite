-- CreateTable: PageView
CREATE TABLE "PageView" (
    "id" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "referrer" TEXT,
    "userAgent" TEXT,
    "country" TEXT,
    "city" TEXT,
    "device" TEXT,
    "browser" TEXT,
    "os" TEXT,
    "sessionId" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PageView_pkey" PRIMARY KEY ("id")
);

-- CreateTable: DailyStats
CREATE TABLE "DailyStats" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "visitors" INTEGER NOT NULL DEFAULT 0,
    "topPages" JSONB,
    "topReferrers" JSONB,
    "topCountries" JSONB,

    CONSTRAINT "DailyStats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: PageView
CREATE INDEX "PageView_timestamp_idx" ON "PageView"("timestamp");
CREATE INDEX "PageView_path_idx" ON "PageView"("path");
CREATE INDEX "PageView_sessionId_idx" ON "PageView"("sessionId");

-- CreateIndex: DailyStats
CREATE UNIQUE INDEX "DailyStats_date_key" ON "DailyStats"("date");
CREATE INDEX "DailyStats_date_idx" ON "DailyStats"("date");
