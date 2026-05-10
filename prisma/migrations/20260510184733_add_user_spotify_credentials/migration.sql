-- AlterTable
ALTER TABLE "User" ADD COLUMN "spotifyAccessToken" TEXT;
ALTER TABLE "User" ADD COLUMN "spotifyClientId" TEXT;
ALTER TABLE "User" ADD COLUMN "spotifyRefreshToken" TEXT;
ALTER TABLE "User" ADD COLUMN "spotifyTokenExpiresAt" DATETIME;
