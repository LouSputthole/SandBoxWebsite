-- In-app notifications, one row per event per user. JSON payload keeps
-- the table flexible as we add notification kinds. (userId, readAt)
-- composite index makes the bell-badge unread-count query trivial.

CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Notification_userId_readAt_idx"
    ON "Notification"("userId", "readAt");
CREATE INDEX "Notification_userId_createdAt_idx"
    ON "Notification"("userId", "createdAt");

ALTER TABLE "Notification"
    ADD CONSTRAINT "Notification_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
