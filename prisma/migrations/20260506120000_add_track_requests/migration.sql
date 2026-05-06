-- Add first-class track requests plus optional torrent automation settings.
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
    CONSTRAINT "Request_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "new_Request" (
    "id",
    "type",
    "mbid",
    "title",
    "artistName",
    "coverUrl",
    "status",
    "requestedById",
    "requestedAt",
    "approvedAt",
    "declineReason",
    "lidarrId",
    "qualityProfileId"
)
SELECT
    "id",
    "type",
    "mbid",
    "title",
    "artistName",
    "coverUrl",
    "status",
    "requestedById",
    "requestedAt",
    "approvedAt",
    "declineReason",
    "lidarrId",
    "qualityProfileId"
FROM "Request";

DROP TABLE "Request";
ALTER TABLE "new_Request" RENAME TO "Request";
CREATE INDEX "Request_status_idx" ON "Request"("status");
CREATE INDEX "Request_requestedById_idx" ON "Request"("requestedById");
CREATE INDEX "Request_type_mbid_idx" ON "Request"("type", "mbid");

ALTER TABLE "Settings" ADD COLUMN "prowlarrUrl" TEXT;
ALTER TABLE "Settings" ADD COLUMN "prowlarrApiKey" TEXT;
ALTER TABLE "Settings" ADD COLUMN "qbittorrentUrl" TEXT;
ALTER TABLE "Settings" ADD COLUMN "qbittorrentUsername" TEXT;
ALTER TABLE "Settings" ADD COLUMN "qbittorrentPassword" TEXT;
ALTER TABLE "Settings" ADD COLUMN "trackTorrentCategory" TEXT;
ALTER TABLE "Settings" ADD COLUMN "trackTorrentSavePath" TEXT;
ALTER TABLE "Settings" ADD COLUMN "trackTorrentMaxSizeMb" INTEGER NOT NULL DEFAULT 200;
