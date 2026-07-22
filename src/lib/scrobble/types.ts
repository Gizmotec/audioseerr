// Shared types for the scrobble services (Last.fm, ListenBrainz).

export type ScrobbleTrack = {
  artistName: string;
  title: string;
  albumTitle?: string | null;
  durationMs?: number | null;
  recordingMbid?: string | null;
};

// A real MusicBrainz id is a UUID. Audioseerr also carries pseudo-ids like
// "lidarr:<id>" and "local:<id>" for tracks that have no MusicBrainz match —
// those must never be sent to scrobble services as MBIDs.
const MBID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isRealMbid(id: string | null | undefined): id is string {
  return !!id && MBID_RE.test(id);
}
