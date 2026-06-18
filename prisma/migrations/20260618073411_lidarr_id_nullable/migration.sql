-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_LibraryItem" (
    "mbid" TEXT NOT NULL PRIMARY KEY,
    "lidarrId" INTEGER,
    "status" TEXT NOT NULL,
    "artistName" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "trackFileCount" INTEGER NOT NULL DEFAULT 0,
    "totalTrackCount" INTEGER NOT NULL DEFAULT 0,
    "lastSyncedAt" DATETIME NOT NULL
);
INSERT INTO "new_LibraryItem" ("artistName", "lastSyncedAt", "lidarrId", "mbid", "status", "title", "totalTrackCount", "trackFileCount") SELECT "artistName", "lastSyncedAt", "lidarrId", "mbid", "status", "title", "totalTrackCount", "trackFileCount" FROM "LibraryItem";
DROP TABLE "LibraryItem";
ALTER TABLE "new_LibraryItem" RENAME TO "LibraryItem";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
