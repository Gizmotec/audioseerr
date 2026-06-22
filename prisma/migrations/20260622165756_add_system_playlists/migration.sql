-- CreateTable
CREATE TABLE "PlaylistSubscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "playlistId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlaylistSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlaylistSubscription_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "Playlist" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Playlist" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "coverUrl" TEXT,
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "slug" TEXT,
    "tagsJson" TEXT,
    "nextRefreshAt" DATETIME,
    "lastRefreshedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Playlist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Playlist" ("coverUrl", "createdAt", "description", "id", "isShared", "name", "updatedAt", "userId") SELECT "coverUrl", "createdAt", "description", "id", "isShared", "name", "updatedAt", "userId" FROM "Playlist";
DROP TABLE "Playlist";
ALTER TABLE "new_Playlist" RENAME TO "Playlist";
CREATE UNIQUE INDEX "Playlist_slug_key" ON "Playlist"("slug");
CREATE INDEX "Playlist_userId_idx" ON "Playlist"("userId");
CREATE INDEX "Playlist_isShared_idx" ON "Playlist"("isShared");
CREATE INDEX "Playlist_isSystem_nextRefreshAt_idx" ON "Playlist"("isSystem", "nextRefreshAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "PlaylistSubscription_playlistId_idx" ON "PlaylistSubscription"("playlistId");

-- CreateIndex
CREATE UNIQUE INDEX "PlaylistSubscription_userId_playlistId_key" ON "PlaylistSubscription"("userId", "playlistId");
