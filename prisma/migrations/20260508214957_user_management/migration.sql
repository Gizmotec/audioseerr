-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Invite" (
    "token" TEXT NOT NULL PRIMARY KEY,
    "createdById" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    "usedById" TEXT,
    CONSTRAINT "Invite_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Invite_usedById_fkey" FOREIGN KEY ("usedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Invite" ("createdById", "expiresAt", "token", "usedAt", "usedById") SELECT "createdById", "expiresAt", "token", "usedAt", "usedById" FROM "Invite";
DROP TABLE "Invite";
ALTER TABLE "new_Invite" RENAME TO "Invite";
CREATE INDEX "Invite_expiresAt_idx" ON "Invite"("expiresAt");
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
    CONSTRAINT "Request_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Request" ("albumMbid", "albumPosition", "albumTitle", "approvedAt", "artistName", "coverUrl", "declineReason", "downloadTitle", "id", "lidarrId", "mbid", "qualityProfileId", "recordingMbid", "requestedAt", "requestedById", "status", "title", "torrentHash", "type") SELECT "albumMbid", "albumPosition", "albumTitle", "approvedAt", "artistName", "coverUrl", "declineReason", "downloadTitle", "id", "lidarrId", "mbid", "qualityProfileId", "recordingMbid", "requestedAt", "requestedById", "status", "title", "torrentHash", "type" FROM "Request";
DROP TABLE "Request";
ALTER TABLE "new_Request" RENAME TO "Request";
CREATE INDEX "Request_status_idx" ON "Request"("status");
CREATE INDEX "Request_requestedById_idx" ON "Request"("requestedById");
CREATE INDEX "Request_type_mbid_idx" ON "Request"("type", "mbid");
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "autoApprove" BOOLEAN NOT NULL DEFAULT false,
    "requestQuota" INTEGER NOT NULL DEFAULT 20,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_User" ("createdAt", "email", "id", "passwordHash", "requestQuota", "role", "username") SELECT "createdAt", "email", "id", "passwordHash", "requestQuota", "role", "username" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
