-- CreateTable
CREATE TABLE "RecentSearch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "lastSearchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RecentSearch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "RecentSearch_userId_lastSearchedAt_idx" ON "RecentSearch"("userId", "lastSearchedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RecentSearch_userId_query_key" ON "RecentSearch"("userId", "query");
