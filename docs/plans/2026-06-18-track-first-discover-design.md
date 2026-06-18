# Track-first Discover page

**Status:** Designed (not yet implemented)
**Date:** 2026-06-18

## Problem

The app is moving from album-first to track-first (individual songs). Search and
the artist page were already converted by earlier work (commit `2914212`:
`loadArtistLanding` + the preview-only `TopTracksList`). The **Discover** page is
still album-first: "Top new releases" and "Trending in {genre}" are grids of
Deezer **albums** (`DiscoveryRow`/`DiscoveryAlbumCard`), the copy says "Find an
album … before sending it to Lidarr", and in-library badges are album-level
(`buildLibraryIndex`).

This is phase one of a broader track-first sweep. **Scope: Discover only.** Home
shelves, Genre pages, and album-level badges are deliberate follow-ups.

## Decisions

1. **Discover shows songs, not albums.** Each discovery row is a list of tracks
   with a 30s preview and an **inline Download** button.
2. **Inline download** (no album-page hop). A discovery track carries only
   title/artist/album/preview, so the action resolves it to MusicBrainz first,
   then reuses the existing slskd request path.
3. **New `DiscoveryTrackList` component** — Discover-specific, so we don't edit
   the shared `TopTracksList` the parallel search/artist work owns (zero
   collision risk).
4. **"Fresh tracks" replaces "Top new releases"** — a track row sourced from
   Deezer new-release albums' lead tracks (approximate but keeps a "what's new"
   surface as songs).
5. **Per-track "already owned" badges are deferred** — computing them needs a
   MusicBrainz resolve per chart track at page load (too many API calls). The
   Download click is idempotent instead (`ensureTrackRequested` no-ops when the
   track is already requested/owned), so re-clicking is harmless.

## Page layout (new)

`src/app/discover/page.tsx`, top to bottom:

- Header — copy updated: "Find what belongs in your library next" stays; the
  sub-line drops "albums" and "Lidarr". Search section heading "Find an album" →
  "Search". `SearchBar` unchanged (already artist/track-aware).
- **Trending now** — `DiscoveryTrackList`, Deezer global chart tracks.
- **Fresh tracks** — `DiscoveryTrackList`, lead tracks of Deezer new releases.
- **Trending in pop / rock / electronic** — one `DiscoveryTrackList` per tag,
  Deezer genre chart tracks (replaces the album `DiscoveryRow`s).
- **Top artists** (`TopArtistsChart`) and **Most loved** (`MostLovedChart`) —
  kept as-is (artist / polymorphic, not album-first).
- **Browse by genre** chips — kept; still link to `/genre/[tag]` (album-based
  until the follow-up). One acknowledged inconsistency during phased rollout.

Removed from Discover: `getDeezerNewReleaseAlbums` + `getDeezerChartAlbums` rows,
`DiscoveryRow`/`DiscoveryAlbumCard` usage, and `buildLibraryIndex()`
(album-badge data). `TopTracksChart` (Last.fm) is superseded by the actionable
"Trending now" row and removed from Discover. None of these helpers/components
are deleted — Genre/Home still use them — Discover just stops importing them.

## Data sources (new lib functions)

`src/lib/deezer.ts`:

- `getDeezerChartTracks(genreSlug: string | null, limit = 12)` →
  `DiscoveryTrack[]`. Hits Deezer `/chart/{genreId}/tracks` (genreId resolved by
  the same slug→id map `getDeezerChartAlbums` already uses; `null`/"all" → chart
  0, the global chart). Used for "Trending now" and each genre row.
- `getDeezerNewReleaseTracks(limit = 12)` → `DiscoveryTrack[]`. Reuses
  `getDeezerNewReleaseAlbums`, then resolves each album to its opening track via
  the Deezer album tracklist (bounded `Promise.all`, per-album `.catch` → skip).

`DiscoveryTrack = { title, artistName, albumTitle, coverUrl, previewUrl,
durationMs }` — the shape `DiscoveryTrackList` renders. Everything is best-effort;
a failed row resolves to `[]` and is hidden (same pattern as today's `settled`).

## Inline download flow

New server action `requestDiscoveryTrackAction(input: { title, artistName,
albumTitle, coverUrl })` (in `src/app/discover/actions.ts`):

1. Auth guard (signed-in user).
2. `findAlbumByArtistTitle(artistName, albumTitle)` → album MBID. Miss →
   `{ ok: false, reason: "no-album" }`.
3. `getAlbum(albumMbid)` → tracklist; match the song by normalized title →
   `{ albumPosition, recordingMbid }`. Miss → `{ ok: false, reason: "no-track" }`.
4. `ensureTrackRequested({ albumMbid, albumTitle, artistName, coverUrl,
   recordingMbid, trackTitle: title, albumPosition })` — existing path; respects
   auto-approve, dedups, kicks off slskd.
5. `{ ok: true }`.

The action does MusicBrainz work **per click** (never at page load), so it costs
nothing until a user actually wants a song. Chart tracks are mainstream, so
resolution succeeds for the common case; obscure misses surface as a row error.

## Components

`src/components/DiscoveryTrackList.tsx` (client):

- Props: `{ title: string; tracks: DiscoveryTrack[] }`. Renders nothing when
  `tracks` is empty.
- Each row: cover thumb, title, `artist · album`, a preview play/pause button
  (`usePreviewPlayer().play` with an ephemeral `previewUrl`; no scrobble — no
  recordingMbid), duration, and a **Download** button.
- Download button calls `requestDiscoveryTrackAction(track)` inside a transition.
  Per-row state machine: `idle → resolving (spinner) → done (✓) | error (✗ with
  title tooltip "Couldn't find this track to download")`. Mirrors the visual
  language of `RequestTrackButton` on the album page.

## Edge cases

- **No `previewUrl`**: preview button disabled; Download still works.
- **Resolution failure** (`no-album`/`no-track`): row shows ✗ with an explanatory
  tooltip; nothing is queued.
- **Already owned / requested**: `ensureTrackRequested` no-ops or grants
  visibility; the row still flips to ✓ ("added").
- **Deezer/Last.fm down**: each source is `.catch(() => [])`; empty rows hide, the
  page still renders search + artists + genres.

## Testing / verification

- `tsc` + lint clean; `next build` passes.
- Preview: Discover renders track rows (no album grids); preview plays a 30s clip;
  Download on a mainstream track flips idle → resolving → ✓ and creates a TRACK
  request (check `/requests`); an obscure/garbage title shows ✗.
- Regression: Genre pages, Home, search, artist still render (their shared
  helpers/components untouched).

## Out of scope (follow-ups)

Genre pages, Home shelves (downloaded-albums / top-artists-by-album-count /
played-albums), and album-level `InLibraryBadge` → track-first in later passes.
