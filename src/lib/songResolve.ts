// Resolve a song known only loosely (title + artist + album, as Deezer/Last.fm
// hand it to us) into a concrete MusicBrainz album position we can request and
// add to a playlist. Shared by the discover download path and playlist
// recommendations so both resolve identically.

import { normalizeTrackTitle } from "@/lib/deezer";
import { findAlbumByArtistTitle, getAlbum } from "@/lib/musicbrainz";

export type SongResolveInput = {
  title: string;
  artistName: string;
  albumTitle: string | null;
  coverUrl: string | null;
};

export type SongResolveOptions = {
  /** Match against standalone singles, not just albums/EPs. Recommendations
   * and discovery are both single-heavy, so they pass true. */
  includeSingles?: boolean;
};

export type ResolvedSong = {
  albumMbid: string;
  albumTitle: string;
  artistName: string;
  coverUrl: string | null;
  /** Real recording MBID when MusicBrainz has one — null otherwise. */
  recordingMbid: string | null;
  title: string;
  /** 1-indexed position across the whole release (the playlist/library key). */
  albumPosition: number;
  durationMs: number | null;
};

/**
 * Find the album on MusicBrainz, then locate the track within it by normalized
 * title. Returns null on any miss (no album title, album not found, track not on
 * the tracklist) — the common failure, which callers surface as "couldn't find
 * this track." Never throws.
 */
export async function resolveSong(
  input: SongResolveInput,
  opts: SongResolveOptions = {},
): Promise<ResolvedSong | null> {
  if (!input.albumTitle) return null;

  const album = await findAlbumByArtistTitle(input.artistName, input.albumTitle, {
    includeSingles: opts.includeSingles ?? false,
  });
  if (!album) return null;

  const detail = await getAlbum(album.mbid);
  if (!detail) return null;

  const want = normalizeTrackTitle(input.title);
  const track = detail.tracks.find((t) => normalizeTrackTitle(t.title) === want);
  if (!track) return null;

  return {
    albumMbid: album.mbid,
    albumTitle: album.title,
    artistName: album.artistName,
    coverUrl: input.coverUrl ?? album.coverUrl ?? null,
    recordingMbid: track.recordingMbid,
    title: track.title,
    albumPosition: track.absolutePosition,
    durationMs: track.lengthMs,
  };
}
