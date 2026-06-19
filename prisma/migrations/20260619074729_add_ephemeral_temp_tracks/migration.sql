-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DownloadedTrack" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ephemeral" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" DATETIME
);
INSERT INTO "new_DownloadedTrack" ("albumMbid", "albumPosition", "albumTitle", "artistName", "bitrate", "coverUrl", "createdAt", "durationMs", "filePath", "format", "id", "recordingMbid", "sizeBytes", "title") SELECT "albumMbid", "albumPosition", "albumTitle", "artistName", "bitrate", "coverUrl", "createdAt", "durationMs", "filePath", "format", "id", "recordingMbid", "sizeBytes", "title" FROM "DownloadedTrack";
DROP TABLE "DownloadedTrack";
ALTER TABLE "new_DownloadedTrack" RENAME TO "DownloadedTrack";
CREATE INDEX "DownloadedTrack_recordingMbid_idx" ON "DownloadedTrack"("recordingMbid");
CREATE INDEX "DownloadedTrack_ephemeral_expiresAt_idx" ON "DownloadedTrack"("ephemeral", "expiresAt");
CREATE UNIQUE INDEX "DownloadedTrack_albumMbid_albumPosition_key" ON "DownloadedTrack"("albumMbid", "albumPosition");
CREATE TABLE "new_Request" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "mbid" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "artistName" TEXT NOT NULL,
    "coverUrl" TEXT,
    "albumMbid" TEXT,
    "albumTitle" TEXT,
    "recordingMbid" TEXT,
    "albumPosition" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT NOT NULL,
    "requestedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" DATETIME,
    "declineReason" TEXT,
    "lidarrId" INTEGER,
    "qualityProfileId" INTEGER,
    "torrentHash" TEXT,
    "downloadTitle" TEXT,
    "slskdUsername" TEXT,
    "slskdFile" TEXT,
    "slskdFilesJson" TEXT,
    "ephemeral" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" DATETIME,
    CONSTRAINT "Request_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Request" ("albumMbid", "albumPosition", "albumTitle", "approvedAt", "artistName", "coverUrl", "declineReason", "downloadTitle", "id", "lidarrId", "mbid", "qualityProfileId", "recordingMbid", "requestedAt", "requestedById", "slskdFile", "slskdFilesJson", "slskdUsername", "status", "title", "torrentHash", "type") SELECT "albumMbid", "albumPosition", "albumTitle", "approvedAt", "artistName", "coverUrl", "declineReason", "downloadTitle", "id", "lidarrId", "mbid", "qualityProfileId", "recordingMbid", "requestedAt", "requestedById", "slskdFile", "slskdFilesJson", "slskdUsername", "status", "title", "torrentHash", "type" FROM "Request";
DROP TABLE "Request";
ALTER TABLE "new_Request" RENAME TO "Request";
CREATE INDEX "Request_status_idx" ON "Request"("status");
CREATE INDEX "Request_requestedById_idx" ON "Request"("requestedById");
CREATE INDEX "Request_type_mbid_idx" ON "Request"("type", "mbid");
CREATE TABLE "new_Settings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "lidarrUrl" TEXT,
    "lidarrApiKey" TEXT,
    "lidarrDefaultProfileId" INTEGER,
    "lidarrRootFolderPath" TEXT,
    "prowlarrUrl" TEXT,
    "prowlarrApiKey" TEXT,
    "qbittorrentUrl" TEXT,
    "qbittorrentUsername" TEXT,
    "qbittorrentPassword" TEXT,
    "trackTorrentCategory" TEXT,
    "trackTorrentSavePath" TEXT,
    "trackTorrentMaxSizeMb" INTEGER NOT NULL DEFAULT 200,
    "slskdUrl" TEXT,
    "slskdApiKey" TEXT,
    "slskdDownloadPath" TEXT,
    "lastFmApiKey" TEXT,
    "mediaPathMap" TEXT,
    "setupComplete" BOOLEAN NOT NULL DEFAULT false,
    "preDownloadMixes" BOOLEAN NOT NULL DEFAULT false
);
INSERT INTO "new_Settings" ("id", "lastFmApiKey", "lidarrApiKey", "lidarrDefaultProfileId", "lidarrRootFolderPath", "lidarrUrl", "mediaPathMap", "prowlarrApiKey", "prowlarrUrl", "qbittorrentPassword", "qbittorrentUrl", "qbittorrentUsername", "setupComplete", "slskdApiKey", "slskdDownloadPath", "slskdUrl", "trackTorrentCategory", "trackTorrentMaxSizeMb", "trackTorrentSavePath") SELECT "id", "lastFmApiKey", "lidarrApiKey", "lidarrDefaultProfileId", "lidarrRootFolderPath", "lidarrUrl", "mediaPathMap", "prowlarrApiKey", "prowlarrUrl", "qbittorrentPassword", "qbittorrentUrl", "qbittorrentUsername", "setupComplete", "slskdApiKey", "slskdDownloadPath", "slskdUrl", "trackTorrentCategory", "trackTorrentMaxSizeMb", "trackTorrentSavePath" FROM "Settings";
DROP TABLE "Settings";
ALTER TABLE "new_Settings" RENAME TO "Settings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
