-- CreateTable
CREATE TABLE "SpotifyPlaylistImport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "playlistId" TEXT NOT NULL,
    "trackIdsJson" TEXT NOT NULL,
    "lastImportedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SpotifyPlaylistImport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "SpotifyPlaylistImport_userId_playlistId_key" ON "SpotifyPlaylistImport"("userId", "playlistId");
