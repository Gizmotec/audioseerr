# Playlist recommendations ("Recommended for this playlist")

Date: 2026-06-18

## Goal

Spotify-style suggestions: once an editable playlist has a few tracks, show a
"Recommended for this playlist" shelf of songs that fit alongside what's there,
each with a 30s preview and an **Add** button.

Decisions (from brainstorming):

- **Source:** both library + downloadable, **library first**. Songs already in
  the user's downloaded library are shown first and add instantly; songs the user
  doesn't own are shown below and download (Soulseek) when added.
- **Placement:** auto section at the bottom of the playlist page (no button),
  lazily loaded after mount.

## Architecture

No schema changes. Everything reuses existing clients and the existing
download/add path.

### Engine — `src/lib/recommendations.ts`

`getPlaylistRecommendations(viewer, playlistId, { offset, limit })`:

1. Load the playlist's tracks (owner-scoped). Below `MIN_SEED_TRACKS` (3) → `[]`.
2. **Seeds:** most-recently-added tracks, one per artist for variety, capped at 8.
3. **Last.fm `track.getsimilar`** (new in `lastfm.ts`) fanned out across seeds.
4. **Aggregate & score:** score = sum of `match` weights across seeds that
   surfaced a song (multi-seed agreement ranks higher). Exclude songs already in
   the playlist. Cap 2 per artist. Bound the pool to 30.
5. **Enrich** via Deezer `findDeezerTrack` (new in `deezer.ts`): album title (also
   what makes a song downloadable), cover, 30s preview, duration. Drop
   downloadable candidates Deezer can't resolve to an album.
6. **Annotate `inLibrary`** against the user's `DownloadedTrack` set
   (`listAvailablePlaylistTracks`), and sort library-first.

External calls are individually cached (`getSimilarTracks` 1d, `findDeezerTrack`
7d), so a warm playlist recomputes from cache with no network — the engine itself
holds no cache (avoids caching transient-empty results).

### Shared resolver — `src/lib/songResolve.ts`

`resolveSong(input, { includeSingles })` turns a loosely-known song
(title/artist/album) into a MusicBrainz album position. Extracted from the
discover download action (which now reuses it) and used by the recommendation
add path.

### Actions — `src/lib/actions/playlists.ts`

- `getPlaylistRecommendationsAction(playlistId, offset)` — lazy fetch; paginates
  the ranked pool for the "Refresh" button. Returns `[]` (not an error) when the
  playlist is short / has no suggestions / no Last.fm key.
- `addRecommendationToPlaylistAction(playlistId, rec)` — library tracks added by
  known identity (instant, `autoFetch` grants visibility, no re-download);
  downloadable ones resolved via `resolveSong`, then inserted — `autoFetchMissing`
  kicks off the Soulseek fetch, exactly like the normal "Add songs" flow.

### UI — `src/components/PlaylistRecommendations.tsx`

Client component rendered from `PlaylistDetail` when `!readOnly && tracks ≥ 3`.
Loads on mount, renders rows mirroring `DiscoveryTrackList` (preview + Add),
shows an "In library" badge, and has a Refresh that swaps in the next page.

## Out of scope (v1)

- Liked Songs and shared/read-only playlists (owner-editable only).
- Personalization beyond the playlist's own tracks (no play-history weighting).

## Verification

Seeded a 4-track test playlist (Cage the Elephant, Imagine Dragons, Mac Miller,
Taylor Swift) and confirmed in the dev preview: 12 relevant suggestions, per-artist
cap holding, 7/30 detected as in-library and sorted first. Type-clean and lint-clean.
