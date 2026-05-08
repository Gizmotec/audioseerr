-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Playlist" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "coverUrl" TEXT,
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Playlist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Playlist" ("coverUrl", "createdAt", "description", "id", "name", "updatedAt", "userId") SELECT "coverUrl", "createdAt", "description", "id", "name", "updatedAt", "userId" FROM "Playlist";
DROP TABLE "Playlist";
ALTER TABLE "new_Playlist" RENAME TO "Playlist";
CREATE INDEX "Playlist_userId_idx" ON "Playlist"("userId");
CREATE INDEX "Playlist_isShared_idx" ON "Playlist"("isShared");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
