-- CreateTable
CREATE TABLE "ScheduledTweet" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "kind" TEXT,
    "itemSlug" TEXT,
    "inReplyToTweetId" TEXT,
    "postedTweetId" TEXT,
    "failureReason" TEXT,
    "attemptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduledTweet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScheduledTweet_status_scheduledFor_idx" ON "ScheduledTweet"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "ScheduledTweet_scheduledFor_idx" ON "ScheduledTweet"("scheduledFor");
