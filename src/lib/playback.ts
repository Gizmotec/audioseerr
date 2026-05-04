// Resolves MusicBrainz track positions to Lidarr trackFileIds for a single
// album. Used by the album page to decide which tracks should play full audio
// (via /api/stream) vs. fall back to a 30s Deezer preview.

import { listTracksByAlbum } from "@/lib/lidarr";
import type { LidarrConfig } from "@/lib/lidarr";

export type TrackFileLookup = Map<number, number>;

/**
 * Returns a map of `MusicBrainz position → Lidarr trackFileId` for tracks that
 * actually have files. Position is the 1-indexed track number on the medium.
 *
 * Lidarr's `absoluteTrackNumber` lines up with MB's `position` for
 * single-disc albums. Multi-disc albums need the medium offset, which we
 * derive from `mediumNumber` + the cumulative track counts; the simple
 * `absoluteTrackNumber` from Lidarr already handles this for us.
 */
export async function buildTrackFileLookup(
  config: LidarrConfig,
  lidarrAlbumId: number,
): Promise<TrackFileLookup> {
  const tracks = await listTracksByAlbum(config, lidarrAlbumId);
  const out: TrackFileLookup = new Map();
  for (const t of tracks) {
    if (!t.hasFile || !t.trackFileId) continue;
    const pos = t.absoluteTrackNumber ?? Number.parseInt(t.trackNumber, 10);
    if (!Number.isFinite(pos) || pos <= 0) continue;
    out.set(pos, t.trackFileId);
  }
  return out;
}
