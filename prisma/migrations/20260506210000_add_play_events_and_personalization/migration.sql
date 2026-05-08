-- Add PlayEvent table feeding personalized suggestions on /discover, plus a
-- per-user toggle to disable the feature (and play tracking) entirely.
ALTER TABLE "User" ADD COLUMN "personalizedSuggestionsEnabled" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "PlayEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "recordingMbid" TEXT NOT NULL,
    "albumMbid" TEXT NOT NULL,
    "artistName" TEXT NOT NULL,
    "trackFileId" INTEGER NOT NULL,
    "playedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlayEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "PlayEvent_userId_playedAt_idx" ON "PlayEvent"("userId", "playedAt");
CREATE INDEX "PlayEvent_userId_artistName_idx" ON "PlayEvent"("userId", "artistName");
