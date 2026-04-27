-- Session fingerprinting + LoginEvent audit trail.
-- Existing rows get NULL ipHash/userAgent; lastSeenAt defaults to NOW()
-- so older sessions appear "freshly active" until the next request
-- updates them with the real timestamp.

ALTER TABLE "Session"
    ADD COLUMN "ipHash" TEXT,
    ADD COLUMN "userAgent" TEXT,
    ADD COLUMN "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "Session_userId_lastSeenAt_idx"
    ON "Session"("userId", "lastSeenAt");

CREATE TABLE "LoginEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT,
    "kind" TEXT NOT NULL,
    "reason" TEXT,
    "ipHash" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LoginEvent_userId_createdAt_idx"
    ON "LoginEvent"("userId", "createdAt");
CREATE INDEX "LoginEvent_kind_createdAt_idx"
    ON "LoginEvent"("kind", "createdAt");

ALTER TABLE "LoginEvent"
    ADD CONSTRAINT "LoginEvent_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LoginEvent"
    ADD CONSTRAINT "LoginEvent_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "Session"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
