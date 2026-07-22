-- AlterTable
ALTER TABLE "Settings" ADD COLUMN "lastFmApiSecret" TEXT;
ALTER TABLE "Settings" ADD COLUMN "notificationWebhookUrl" TEXT;

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "requestId" TEXT,
    "readAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" DATETIME,
    CONSTRAINT "ApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "autoApproveArtist" BOOLEAN NOT NULL DEFAULT false,
    "autoApproveAlbum" BOOLEAN NOT NULL DEFAULT false,
    "autoApproveTrack" BOOLEAN NOT NULL DEFAULT false,
    "requestQuota" INTEGER NOT NULL DEFAULT 20,
    "spotifyClientId" TEXT,
    "spotifyAccessToken" TEXT,
    "spotifyRefreshToken" TEXT,
    "spotifyTokenExpiresAt" DATETIME,
    "lastfmUsername" TEXT,
    "lastfmSessionKey" TEXT,
    "scrobbleLastfm" BOOLEAN NOT NULL DEFAULT false,
    "listenbrainzUsername" TEXT,
    "listenbrainzToken" TEXT,
    "scrobbleListenbrainz" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_User" ("autoApproveAlbum", "autoApproveArtist", "autoApproveTrack", "createdAt", "email", "id", "passwordHash", "requestQuota", "role", "spotifyAccessToken", "spotifyClientId", "spotifyRefreshToken", "spotifyTokenExpiresAt", "username") SELECT "autoApproveAlbum", "autoApproveArtist", "autoApproveTrack", "createdAt", "email", "id", "passwordHash", "requestQuota", "role", "spotifyAccessToken", "spotifyClientId", "spotifyRefreshToken", "spotifyTokenExpiresAt", "username" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "ApiKey_userId_idx" ON "ApiKey"("userId");
