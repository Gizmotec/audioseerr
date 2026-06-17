-- AlterTable
ALTER TABLE "Request" ADD COLUMN "slskdFile" TEXT;
ALTER TABLE "Request" ADD COLUMN "slskdUsername" TEXT;

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN "slskdApiKey" TEXT;
ALTER TABLE "Settings" ADD COLUMN "slskdDownloadPath" TEXT;
ALTER TABLE "Settings" ADD COLUMN "slskdUrl" TEXT;

-- CreateTable
CREATE TABLE "DownloadedTrack" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "recordingMbid" TEXT,
    "albumMbid" TEXT NOT NULL,
    "albumPosition" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "artistName" TEXT NOT NULL,
    "albumTitle" TEXT,
    "coverUrl" TEXT,
    "durationMs" INTEGER,
    "filePath" TEXT NOT NULL,
    "format" TEXT,
    "bitrate" INTEGER,
    "sizeBytes" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "UserDownloadedTrack" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "downloadedTrackId" TEXT NOT NULL,
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserDownloadedTrack_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserDownloadedTrack_downloadedTrackId_fkey" FOREIGN KEY ("downloadedTrackId") REFERENCES "DownloadedTrack" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PlaylistTrack" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "playlistId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "recordingMbid" TEXT NOT NULL,
    "trackFileId" INTEGER,
    "albumMbid" TEXT NOT NULL,
    "albumPosition" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "artistName" TEXT NOT NULL,
    "albumTitle" TEXT,
    "coverUrl" TEXT,
    "durationMs" INTEGER,
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlaylistTrack_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "Playlist" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_PlaylistTrack" ("addedAt", "albumMbid", "albumPosition", "albumTitle", "artistName", "coverUrl", "durationMs", "id", "playlistId", "position", "recordingMbid", "title", "trackFileId") SELECT "addedAt", "albumMbid", "albumPosition", "albumTitle", "artistName", "coverUrl", "durationMs", "id", "playlistId", "position", "recordingMbid", "title", "trackFileId" FROM "PlaylistTrack";
DROP TABLE "PlaylistTrack";
ALTER TABLE "new_PlaylistTrack" RENAME TO "PlaylistTrack";
CREATE INDEX "PlaylistTrack_playlistId_position_idx" ON "PlaylistTrack"("playlistId", "position");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "DownloadedTrack_recordingMbid_idx" ON "DownloadedTrack"("recordingMbid");

-- CreateIndex
CREATE UNIQUE INDEX "DownloadedTrack_albumMbid_albumPosition_key" ON "DownloadedTrack"("albumMbid", "albumPosition");

-- CreateIndex
CREATE INDEX "UserDownloadedTrack_userId_idx" ON "UserDownloadedTrack"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserDownloadedTrack_userId_downloadedTrackId_key" ON "UserDownloadedTrack"("userId", "downloadedTrackId");
