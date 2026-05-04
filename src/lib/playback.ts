// Resolves MusicBrainz track positions to Lidarr trackFileIds for a single
// album. Used by the album page to decide which tracks should play full audio
// (via /api/stream) vs. fall back to a 30s Deezer preview.

import { listTracksByAlbum } from "@/lib/lidarr";
import type { LidarrConfig } from "@/lib/lidarr";

/**
 * Map of `absolutePosition → trackFileId`. Absolute position is the 1-indexed
 * track number across the whole release (i.e. counting through all media).
 * We key on absolute position because MB and Lidarr sometimes disagree on
 * medium structure — e.g. MB models a release as two discs while Lidarr
 * collapses it into one medium of 17 tracks. Per-disc positions then collide.
 * Absolute position is the join key both sides agree on.
 */
export type TrackFileLookup = Map<number, number>;

export async function buildTrackFileLookup(
  config: LidarrConfig,
  lidarrAlbumId: number,
): Promise<TrackFileLookup> {
  const tracks = await listTracksByAlbum(config, lidarrAlbumId);
  const out: TrackFileLookup = new Map();
  for (const t of tracks) {
    if (!t.hasFile || !t.trackFileId) continue;
    // Lidarr's `absoluteTrackNumber` walks across mediums; for single-medium
    // releases it equals trackNumber. Fall back to trackNumber when missing.
    const pos = t.absoluteTrackNumber ?? Number.parseInt(t.trackNumber, 10);
    if (!Number.isFinite(pos) || pos <= 0) continue;
    out.set(pos, t.trackFileId);
  }
  return out;
}
