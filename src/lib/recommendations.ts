// Playlist recommendations — the engine behind the Spotify-style "Recommended
// for this playlist" shelf. Given the songs already in a playlist, surface songs
// that fit alongside them.
//
// Pipeline: seed tracks → Last.fm track.getsimilar (fan-out) → score & dedupe →
// per-artist variety cap → Deezer enrichment (cover/preview/album/duration) →
// "in library" annotation. Library matches are returned first ("both, library
// first"). External calls are individually cached (getSimilarTracks 1d,
// findDeezerTrack 7d), so a warm playlist re-computes from cache with no network.

import { findDeezerTrack, normalizeTrackTitle } from "@/lib/deezer";
import { getSimilarTracks } from "@/lib/lastfm";
import { listAvailablePlaylistTracks } from "@/lib/playlists";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import type { LibraryViewer } from "@/lib/userLibrary";

export type PlaylistRecommendation = {
  title: string;
  artistName: string;
  albumTitle: string | null;
  coverUrl: string | null;
  previewUrl: string | null;
  durationMs: number | null;
  /** True when this song is already in the viewer's downloaded library — adding
   * it is instant (no download). */
  inLibrary: boolean;
  /** Precise identity, known for library tracks; null for downloadable ones
   * (resolved against MusicBrainz at add time). */
  albumMbid: string | null;
  albumPosition: number | null;
  recordingMbid: string | null;
  /** The owned track's DownloadedTrack id when `inLibrary`; null otherwise.
   * Lets the Find Similar radio stream an owned match in full
   * (`/api/stream/local/{id}`) without a second query — it comes free from
   * listAvailablePlaylistTracks (which returns the id as `key`). */
  downloadedTrackId: string | null;
};

/** One song to find similar tracks to. The unit the shared engine seeds on. */
export type SeedTrack = { artist: string; track: string; mbid: string | null };

// Below this many tracks a playlist doesn't carry enough signal to recommend
// from — matches the "after you add a few songs" trigger.
export const MIN_SEED_TRACKS = 3;
const MAX_SEEDS = 8;
const SIMILAR_PER_SEED = 30;
const MAX_PER_ARTIST = 2;
const ENRICH_POOL = 30;
const DEFAULT_LIMIT = 12;

const MBID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function matchKey(artist: string, title: string): string {
  return `${normalizeTrackTitle(artist)}|${normalizeTrackTitle(title)}`;
}

function looksLikeMbid(s: string | null): s is string {
  return !!s && MBID_RE.test(s);
}

type Candidate = {
  title: string;
  artistName: string;
  mbid: string | null;
  score: number;
};

/**
 * Core recommendation pipeline, shared by the playlist shelf and Find Similar.
 * Given one or more seed songs, fan out Last.fm `track.getsimilar`, score and
 * dedupe, cap per artist for variety, enrich the top pool with Deezer, and
 * annotate library matches. Returns recommendations in **score order** (callers
 * apply their own ordering/slice). Returns [] when there's no Last.fm key
 * configured or nothing similar turns up.
 */
export async function recommendFromSeeds(
  viewer: LibraryViewer,
  seeds: SeedTrack[],
  opts: { excludeKeys?: Set<string>; poolSize?: number } = {},
): Promise<PlaylistRecommendation[]> {
  if (!viewer || seeds.length === 0) return [];

  const settings = await getSettings();
  if (!settings.lastFmApiKey) return [];
  const config = { apiKey: settings.lastFmApiKey };

  const exclude = opts.excludeKeys ?? new Set<string>();
  const poolSize = opts.poolSize ?? ENRICH_POOL;

  const similarLists = await Promise.all(
    seeds.map((s) => getSimilarTracks(config, s, SIMILAR_PER_SEED)),
  );

  // Aggregate: score = sum of match weights across the seeds that surfaced a
  // song, so songs multiple seeds agree on rank higher.
  const agg = new Map<string, Candidate>();
  for (const list of similarLists) {
    for (const s of list) {
      const k = matchKey(s.artistName, s.name);
      if (exclude.has(k)) continue;
      const weight = s.match > 0 ? s.match : 0.01;
      const existing = agg.get(k);
      if (existing) {
        existing.score += weight;
        if (!existing.mbid && looksLikeMbid(s.mbid)) existing.mbid = s.mbid;
      } else {
        agg.set(k, {
          title: s.name,
          artistName: s.artistName,
          mbid: looksLikeMbid(s.mbid) ? s.mbid : null,
          score: weight,
        });
      }
    }
  }
  if (agg.size === 0) return [];

  // Rank by score, then cap per artist for variety, then bound the enrichment
  // pool (Deezer enrichment is the expensive step).
  const ranked = [...agg.values()].sort((a, b) => b.score - a.score);
  const perArtist = new Map<string, number>();
  const pool: Candidate[] = [];
  for (const c of ranked) {
    const an = normalizeTrackTitle(c.artistName);
    const n = perArtist.get(an) ?? 0;
    if (n >= MAX_PER_ARTIST) continue;
    perArtist.set(an, n + 1);
    pool.push(c);
    if (pool.length >= poolSize) break;
  }

  const libraryTracks = await listAvailablePlaylistTracks(viewer);
  const libraryByKey = new Map(
    libraryTracks.map((t) => [matchKey(t.artistName, t.title), t]),
  );

  // Enrich with Deezer. Album title is required to make a downloadable
  // suggestion addable, so drop candidates Deezer can't resolve — unless they're
  // already in our library, where we already have the full identity.
  const enriched = await Promise.all(
    pool.map(async (c): Promise<PlaylistRecommendation | null> => {
      const lib = libraryByKey.get(matchKey(c.artistName, c.title));
      const deezer = await findDeezerTrack({
        artistName: c.artistName,
        trackName: c.title,
      });

      if (lib) {
        return {
          title: lib.title,
          artistName: lib.artistName,
          albumTitle: lib.albumTitle ?? null,
          coverUrl: lib.coverUrl ?? deezer?.coverUrl ?? null,
          previewUrl: deezer?.previewUrl ?? null,
          durationMs: lib.durationMs ?? deezer?.durationMs ?? null,
          inLibrary: true,
          albumMbid: lib.albumMbid,
          albumPosition: lib.albumPosition,
          recordingMbid: lib.recordingMbid,
          downloadedTrackId: lib.key,
        };
      }

      if (!deezer || !deezer.albumTitle) return null;
      return {
        title: c.title,
        artistName: c.artistName,
        albumTitle: deezer.albumTitle,
        coverUrl: deezer.coverUrl,
        previewUrl: deezer.previewUrl,
        durationMs: deezer.durationMs,
        inLibrary: false,
        albumMbid: null,
        albumPosition: null,
        recordingMbid: c.mbid,
        downloadedTrackId: null,
      };
    }),
  );

  return enriched.filter((r): r is PlaylistRecommendation => r !== null);
}

export async function getPlaylistRecommendations(
  viewer: LibraryViewer,
  playlistId: string,
  opts: { limit?: number; offset?: number } = {},
): Promise<PlaylistRecommendation[]> {
  if (!viewer) return [];
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const offset = opts.offset ?? 0;

  // Owner-scoped: recommendations are only generated for a playlist the viewer
  // owns (the UI renders the shelf only there).
  const playlist = await prisma.playlist.findFirst({
    where: { id: playlistId, userId: viewer.id },
    select: {
      tracks: {
        orderBy: { position: "asc" },
        select: { title: true, artistName: true, recordingMbid: true },
      },
    },
  });
  if (!playlist || playlist.tracks.length < MIN_SEED_TRACKS) return [];

  const tracks = playlist.tracks;
  const inPlaylist = new Set(tracks.map((t) => matchKey(t.artistName, t.title)));

  // Seeds: most-recently-added tracks first (highest positions), one per artist
  // for variety, capped at MAX_SEEDS.
  const seeds: SeedTrack[] = [];
  const seedArtists = new Set<string>();
  for (let i = tracks.length - 1; i >= 0 && seeds.length < MAX_SEEDS; i--) {
    const t = tracks[i]!;
    const an = normalizeTrackTitle(t.artistName);
    if (seedArtists.has(an)) continue;
    seedArtists.add(an);
    seeds.push({
      artist: t.artistName,
      track: t.title,
      mbid: looksLikeMbid(t.recordingMbid) ? t.recordingMbid : null,
    });
  }

  const recommendations = await recommendFromSeeds(viewer, seeds, {
    excludeKeys: inPlaylist,
  });

  // Library-first ordering (the user's choice). Stable sort keeps score order
  // within each group, since recommendFromSeeds returns score-ranked.
  recommendations.sort((a, b) => Number(b.inLibrary) - Number(a.inLibrary));

  return recommendations.slice(offset, offset + limit);
}
