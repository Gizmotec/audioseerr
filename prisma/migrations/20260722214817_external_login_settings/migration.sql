-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    "preDownloadMixes" BOOLEAN NOT NULL DEFAULT false,
    "notificationWebhookUrl" TEXT,
    "lastFmApiSecret" TEXT,
    "oidcEnabled" BOOLEAN NOT NULL DEFAULT false,
    "oidcIssuerUrl" TEXT,
    "oidcClientId" TEXT,
    "oidcClientSecret" TEXT,
    "oidcButtonLabel" TEXT NOT NULL DEFAULT 'SSO',
    "plexEnabled" BOOLEAN NOT NULL DEFAULT true,
    "plexClientIdentifier" TEXT,
    "jellyfinEnabled" BOOLEAN NOT NULL DEFAULT false,
    "jellyfinServerUrl" TEXT,
    "jellyfinApiKey" TEXT
);
INSERT INTO "new_Settings" ("id", "lastFmApiKey", "lastFmApiSecret", "lidarrApiKey", "lidarrDefaultProfileId", "lidarrRootFolderPath", "lidarrUrl", "mediaPathMap", "notificationWebhookUrl", "oidcButtonLabel", "oidcClientId", "oidcClientSecret", "oidcEnabled", "oidcIssuerUrl", "preDownloadMixes", "prowlarrApiKey", "prowlarrUrl", "qbittorrentPassword", "qbittorrentUrl", "qbittorrentUsername", "setupComplete", "slskdApiKey", "slskdDownloadPath", "slskdUrl", "trackTorrentCategory", "trackTorrentMaxSizeMb", "trackTorrentSavePath") SELECT "id", "lastFmApiKey", "lastFmApiSecret", "lidarrApiKey", "lidarrDefaultProfileId", "lidarrRootFolderPath", "lidarrUrl", "mediaPathMap", "notificationWebhookUrl", "oidcButtonLabel", "oidcClientId", "oidcClientSecret", "oidcEnabled", "oidcIssuerUrl", "preDownloadMixes", "prowlarrApiKey", "prowlarrUrl", "qbittorrentPassword", "qbittorrentUrl", "qbittorrentUsername", "setupComplete", "slskdApiKey", "slskdDownloadPath", "slskdUrl", "trackTorrentCategory", "trackTorrentMaxSizeMb", "trackTorrentSavePath" FROM "Settings";
DROP TABLE "Settings";
ALTER TABLE "new_Settings" RENAME TO "Settings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
