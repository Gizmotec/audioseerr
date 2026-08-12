-- Provenance for downloads, so cleanup can tell "you asked for this" from
-- "a playlist you auto-download fetched this". Existing rows default to MANUAL:
-- their real origin is unknowable, and MANUAL is the safe side of that guess.
ALTER TABLE "Request" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "UserDownloadedTrack" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'MANUAL';
