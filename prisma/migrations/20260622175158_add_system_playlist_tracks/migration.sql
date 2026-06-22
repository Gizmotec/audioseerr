-- CreateTable
CREATE TABLE "SystemPlaylistTrack" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "playlistId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "artistName" TEXT NOT NULL,
    "albumTitle" TEXT,
    "coverUrl" TEXT,
    "previewUrl" TEXT,
    "durationMs" INTEGER,
    CONSTRAINT "SystemPlaylistTrack_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "Playlist" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "SystemPlaylistTrack_playlistId_position_idx" ON "SystemPlaylistTrack"("playlistId", "position");
