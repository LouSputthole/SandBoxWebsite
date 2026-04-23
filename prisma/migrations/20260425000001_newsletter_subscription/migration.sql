-- Newsletter subscriptions. Separate from User so non-registered visitors
-- can subscribe from a blog post without Steam login. kinds is a Postgres
-- text[] so we can query "monday-outlook" = ANY("kinds") at send time.

CREATE TABLE "NewsletterSubscription" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "kinds" TEXT[] NOT NULL DEFAULT ARRAY['monday-outlook']::TEXT[],
    "unsubscribeToken" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verifyToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedAt" TIMESTAMP(3),
    "unsubscribedAt" TIMESTAMP(3),
    "lastSentAt" JSONB,

    CONSTRAINT "NewsletterSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NewsletterSubscription_email_key" ON "NewsletterSubscription"("email");
CREATE UNIQUE INDEX "NewsletterSubscription_unsubscribeToken_key" ON "NewsletterSubscription"("unsubscribeToken");
CREATE UNIQUE INDEX "NewsletterSubscription_verifyToken_key" ON "NewsletterSubscription"("verifyToken");
CREATE INDEX "NewsletterSubscription_verified_idx" ON "NewsletterSubscription"("verified");
CREATE INDEX "NewsletterSubscription_unsubscribedAt_idx" ON "NewsletterSubscription"("unsubscribedAt");
