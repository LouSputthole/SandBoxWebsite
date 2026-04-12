-- CreateTable: User
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "steamId" TEXT NOT NULL,
    "username" TEXT,
    "avatarUrl" TEXT,
    "profileUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Session
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable: WatchlistItem
CREATE TABLE "WatchlistItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "itemSlug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WatchlistItem_pkey" PRIMARY KEY ("id")
);

-- Add userId to PriceAlert (optional, for linking alerts to accounts)
ALTER TABLE "PriceAlert" ADD COLUMN "userId" TEXT;

-- CreateIndex: User
CREATE UNIQUE INDEX "User_steamId_key" ON "User"("steamId");

-- CreateIndex: Session
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");
CREATE INDEX "Session_token_idx" ON "Session"("token");
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex: WatchlistItem
CREATE UNIQUE INDEX "WatchlistItem_userId_itemSlug_key" ON "WatchlistItem"("userId", "itemSlug");
CREATE INDEX "WatchlistItem_userId_idx" ON "WatchlistItem"("userId");

-- CreateIndex: PriceAlert userId
CREATE INDEX "PriceAlert_userId_idx" ON "PriceAlert"("userId");

-- AddForeignKey: Session -> User
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: WatchlistItem -> User
ALTER TABLE "WatchlistItem" ADD CONSTRAINT "WatchlistItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: PriceAlert -> User (optional)
ALTER TABLE "PriceAlert" ADD CONSTRAINT "PriceAlert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
