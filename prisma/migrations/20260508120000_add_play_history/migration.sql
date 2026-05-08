-- CreateTable
CREATE TABLE "PlayHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "recordingMbid" TEXT NOT NULL,
    "albumMbid" TEXT,
    "artistName" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "durationMs" INTEGER,
    "playedMs" INTEGER NOT NULL,
    "playedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlayHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PlayHistory_userId_playedAt_idx" ON "PlayHistory"("userId", "playedAt");

-- CreateIndex
CREATE INDEX "PlayHistory_userId_recordingMbid_idx" ON "PlayHistory"("userId", "recordingMbid");

-- CreateIndex
CREATE INDEX "PlayHistory_userId_albumMbid_idx" ON "PlayHistory"("userId", "albumMbid");
