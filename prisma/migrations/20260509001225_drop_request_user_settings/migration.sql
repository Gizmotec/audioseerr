-- Drop requireApproval and registrationMode from Settings — both replaced by
-- per-user behaviour (autoApproveArtist/Album/Track on User; invite tokens
-- gate registration). Rebuilt SQLite-style for portability.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Settings" (
    "id" INTEGER NOT NULL PRIMARY KEY DEFAULT 1,
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
    "lastFmApiKey" TEXT,
    "mediaPathMap" TEXT,
    "setupComplete" BOOLEAN NOT NULL DEFAULT false
);
INSERT INTO "new_Settings" ("id", "lidarrUrl", "lidarrApiKey", "lidarrDefaultProfileId", "lidarrRootFolderPath", "prowlarrUrl", "prowlarrApiKey", "qbittorrentUrl", "qbittorrentUsername", "qbittorrentPassword", "trackTorrentCategory", "trackTorrentSavePath", "trackTorrentMaxSizeMb", "lastFmApiKey", "mediaPathMap", "setupComplete")
SELECT "id", "lidarrUrl", "lidarrApiKey", "lidarrDefaultProfileId", "lidarrRootFolderPath", "prowlarrUrl", "prowlarrApiKey", "qbittorrentUrl", "qbittorrentUsername", "qbittorrentPassword", "trackTorrentCategory", "trackTorrentSavePath", "trackTorrentMaxSizeMb", "lastFmApiKey", "mediaPathMap", "setupComplete" FROM "Settings";
DROP TABLE "Settings";
ALTER TABLE "new_Settings" RENAME TO "Settings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
