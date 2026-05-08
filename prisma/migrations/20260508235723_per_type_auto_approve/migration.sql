-- Replace the single User.autoApprove flag with per-type flags. The table is
-- rebuilt SQLite-style (defer foreign keys, copy, swap) so the migration is
-- safe across all SQLite versions, not just the ones with native DROP COLUMN.
-- The new flags are seeded from the old value so trusted users don't lose
-- their auto-approve state on upgrade.
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_User" ("id", "email", "username", "passwordHash", "role", "autoApproveArtist", "autoApproveAlbum", "autoApproveTrack", "requestQuota", "createdAt")
SELECT "id", "email", "username", "passwordHash", "role", "autoApprove", "autoApprove", "autoApprove", "requestQuota", "createdAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
