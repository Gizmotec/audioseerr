-- CreateTable
CREATE TABLE "UserLibraryItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "mbid" TEXT NOT NULL,
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserLibraryItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserLibraryItem_mbid_fkey" FOREIGN KEY ("mbid") REFERENCES "LibraryItem" ("mbid") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "UserLibraryItem_userId_idx" ON "UserLibraryItem"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserLibraryItem_userId_mbid_key" ON "UserLibraryItem"("userId", "mbid");

-- Backfill: assign every existing LibraryItem to the original admin (the
-- oldest ADMIN user, which is the one created in setup). New users start with
-- an empty library. If no admin exists yet (fresh install), the CROSS JOIN
-- yields zero rows and the insert is a no-op.
INSERT INTO "UserLibraryItem" ("id", "userId", "mbid", "addedAt")
SELECT
  lower(hex(randomblob(16))) AS "id",
  u."id" AS "userId",
  l."mbid" AS "mbid",
  CURRENT_TIMESTAMP AS "addedAt"
FROM "LibraryItem" l
CROSS JOIN (
  SELECT "id" FROM "User" WHERE "role" = 'ADMIN' ORDER BY "createdAt" ASC LIMIT 1
) u;
