-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_LibraryItem" (
    "mbid" TEXT NOT NULL PRIMARY KEY,
    "lidarrId" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "artistName" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "trackFileCount" INTEGER NOT NULL DEFAULT 0,
    "totalTrackCount" INTEGER NOT NULL DEFAULT 0,
    "lastSyncedAt" DATETIME NOT NULL
);
INSERT INTO "new_LibraryItem" ("artistName", "lastSyncedAt", "lidarrId", "mbid", "status", "title") SELECT "artistName", "lastSyncedAt", "lidarrId", "mbid", "status", "title" FROM "LibraryItem";
DROP TABLE "LibraryItem";
ALTER TABLE "new_LibraryItem" RENAME TO "LibraryItem";
CREATE UNIQUE INDEX "LibraryItem_lidarrId_key" ON "LibraryItem"("lidarrId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
