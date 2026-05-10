import { findAlbumByArtistTitle, type MbAlbum } from "@/lib/musicbrainz";
import type { SpotifyTrack } from "@/lib/spotify-api";

// Resolve Spotify playlist tracks to MusicBrainz album IDs so they can be
// turned into Audioseerr requests. We group by Spotify album.id so the same
// album is looked up once even when the playlist has many tracks from it.
//
// Why album-level lookups instead of per-track ISRC lookups: Audioseerr
// already accepts a null recordingMbid (synthesizes one from the album MBID
// + track number), and one MB request per album is roughly 1/10th the
// MB-rate-limit budget of one per track for a typical playlist. The track
// approval path doesn't actually need the recording MBID — it ties into
// Lidarr by album+position.

export type SpotifyMatchResult = {
  matched: SpotifyTrackMatch[];
  notFound: SpotifyTrackMiss[];
  /** Total unique albums looked up — useful for "imported X tracks across Y albums" copy. */
  albumsLookedUp: number;
};

export type MatchConfidence = "confident" | "uncertain";

export type SpotifyTrackMatch = {
  spotifyTrack: SpotifyTrack;
  album: MbAlbum;
  confidence: MatchConfidence;
  /** Why we landed on this confidence — surfaced in the UI as a hover tooltip. */
  reason: string;
};

export type SpotifyTrackMiss = {
  spotifyTrack: SpotifyTrack;
  reason: "no_album_match";
};

export type SpotifyMatchProgress = {
  done: number;
  total: number;
  currentAlbum: string;
};

export async function matchSpotifyTracks(
  tracks: SpotifyTrack[],
  onProgress?: (p: SpotifyMatchProgress) => void,
): Promise<SpotifyMatchResult> {
  // Group by Spotify album.id, preserving the first track in each group as
  // the "canonical" album metadata source.
  const albumGroups = new Map<
    string,
    { albumName: string; albumArtist: string; tracks: SpotifyTrack[] }
  >();
  for (const t of tracks) {
    const existing = albumGroups.get(t.album.id);
    if (existing) {
      existing.tracks.push(t);
    } else {
      albumGroups.set(t.album.id, {
        albumName: t.album.name,
        albumArtist: t.album.primaryArtist,
        tracks: [t],
      });
    }
  }

  const matched: SpotifyTrackMatch[] = [];
  const notFound: SpotifyTrackMiss[] = [];

  let done = 0;
  const total = albumGroups.size;
  for (const group of albumGroups.values()) {
    onProgress?.({ done, total, currentAlbum: group.albumName });
    const album = await findAlbumByArtistTitle(group.albumArtist, group.albumName);
    if (album) {
      const { confidence, reason } = scoreMatch(
        { artist: group.albumArtist, title: group.albumName },
        album,
      );
      for (const t of group.tracks) {
        matched.push({ spotifyTrack: t, album, confidence, reason });
      }
    } else {
      for (const t of group.tracks) {
        notFound.push({ spotifyTrack: t, reason: "no_album_match" });
      }
    }
    done += 1;
  }
  onProgress?.({ done, total, currentAlbum: "" });

  return { matched, notFound, albumsLookedUp: total };
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// findAlbumByArtistTitle already requires an exact normalized artist match
// (it filters MB hits down to those whose normalized artistName equals the
// requested artist). So all matches we get here have artist agreement. The
// remaining axis worth scoring is the title — exact title match → confident,
// suffix-y match (Deluxe / Remastered / etc.) → uncertain because the user
// might have wanted a different edition.
function scoreMatch(
  spotify: { artist: string; title: string },
  mb: MbAlbum,
): { confidence: MatchConfidence; reason: string } {
  const wantTitle = normalize(spotify.title);
  const gotTitle = normalize(mb.title);
  if (gotTitle === wantTitle) {
    return { confidence: "confident", reason: "Exact title and artist match." };
  }
  return {
    confidence: "uncertain",
    reason: `Title differs: "${spotify.title}" vs MusicBrainz "${mb.title}". Could be a remaster or different edition.`,
  };
}
