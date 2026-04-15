-- CreateTable
CREATE TABLE "SentTweet" (
    "id" TEXT NOT NULL,
    "tweetId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "kind" TEXT,
    "itemSlug" TEXT,
    "inReplyToTweetId" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SentTweet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SentTweet_tweetId_key" ON "SentTweet"("tweetId");

-- CreateIndex
CREATE INDEX "SentTweet_sentAt_idx" ON "SentTweet"("sentAt");

-- CreateIndex
CREATE INDEX "SentTweet_itemSlug_idx" ON "SentTweet"("itemSlug");
