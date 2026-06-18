# Track-first Home, Genre pages, and badge removal (Phase 2)

**Status:** Designed (not yet implemented)
**Date:** 2026-06-18

## Problem

Phase 1 made Library/Discover/search/artist track-first. The remaining
album-first surfaces are **Home** (album shelves), **Genre pages** (album grids),
and album **"In Library" badges**.

**Collision constraint:** a parallel session has *uncommitted* work in
`deezer.ts`, `lastfm.ts`, `actions/playlists.ts`, `discover/actions.ts`
(refactored into a shared `resolveSong`), plus new `mixes.ts`,
`recommendations.ts`, `songResolve.ts`, `src/app/mix/`, `MixCards`. To avoid
bundling their half-done work, **everything here touches only clean or new
files** — no edits to `deezer.ts`/`lastfm.ts`/`discover/*`.

## Decisions

1. **Home → full track-first.** Replace album shelves with song shelves:
   *Recently added*, *Recently played*, *Most played* (all tracks), and *Top
   artists* ranked by track count. Keep Playlists + Quick search.
2. **Genre → track lists.** Deezer-mapped genres use the existing
   `getDeezerChartTracks` + `DiscoveryTrackList`. `indie`/`ambient` (Last.fm-only)
   are enriched through Deezer in a **new isolated module** so they're still
   downloadable.
3. **Remove badges.** Drop `InLibraryBadge` + the `formatTrackLine` track-count
   from album cards entirely (user chose removal). Album cards still appear on
   artist discography + album search — they just no longer carry an in-library
   chip.

## Home (`src/app/home/page.tsx`, rewrite — clean file)

Data, all viewer-scoped, replacing the `libraryItem`/played-album queries:

- **Recently added** — `prisma.downloadedTrack` ordered `createdAt desc`, take ~8.
- **Recently played** / **Most played** — new `playHistory` track helpers
  (below).
- **Top artists** — `downloadedTrack.groupBy(artistName)` counting tracks.

New `src/lib/playHistory.ts` additions (clean file) — mirror the album versions
but resolve to owned tracks:

- `getRecentlyPlayedTracks(userId, limit, viewer)` and
  `getMostPlayedTracks(userId, limit, viewer)`:
  `playHistory.groupBy(["recordingMbid"])` (max playedAt + count), then
  `downloadedTrack.findMany({ recordingMbid: { in }, ...viewerScope })` to get the
  playable row (id → streamUrl, title, artist, album, cover, duration). Tracks the
  viewer no longer owns drop out (nothing to play). PlayHistory has no position,
  so the join key is `recordingMbid` (always set on a scrobble).

New `src/components/OwnedTrackList.tsx` (client): a compact playable shelf —
title heading, rows of {play button, cover, title, `artist · album`, optional
caption, duration}. Row click → `usePreviewPlayer().playQueue(rows, idx)` using
each row's `/api/stream/local/<id>`. Used by all three Home track shelves.

Copy: header and empty-state lose "albums"/"Lidarr" wording.

## Genre (`src/app/genre/[tag]/page.tsx`, rewrite — clean file)

- `hasDeezerChartGenre(tag)` → `getDeezerChartTracks(tag, 48)` →
  `DiscoveryTrackList`.
- Else → `getGenreFallbackTracks(tag, lastFmKey, 24)` from a **new**
  `src/lib/genreFallbackTracks.ts`: fetch Last.fm `tag.gettoptracks` (minimal
  inline fetch — does not touch the dirty `lastfm.ts`), then enrich each via the
  already-committed `getDeezerTrackArtwork(artist, track)` to recover
  `albumTitle` + cover (so the inline download resolves). `previewUrl` is null on
  this path (Last.fm has none) → preview button disabled, download still works.
  Bounded concurrency; per-track failures dropped.
- Drops `DiscoveryAlbumCard`, `buildLibraryIndex`, `getDeezerChartAlbums`,
  `getTopAlbumsByTag` from this page.

## Badge removal (clean files)

- `src/components/DiscoveryAlbumCard.tsx`, `src/app/search/AlbumCard.tsx`: remove
  the `InLibraryBadge` render and the `formatTrackLine` track-count line; drop the
  now-unused `libraryHit` prop.
- `src/app/artist/[mbid]/page.tsx`, `src/app/search/page.tsx`: stop building/
  passing the library index for badges (leave `buildLibraryIndex`/`LibraryItem`
  in place — still derived; just unused here).
- Leave `InLibraryBadge.tsx` file in place (unused) to avoid touching anything
  the parallel work might import; remove its usages only.

## Edge cases

- Played track no longer owned / unmatched `recordingMbid` → omitted from Home
  shelves (can't stream it).
- Empty library → existing empty state (copy updated).
- Genre fallback track with no Deezer album match → dropped (not downloadable).
- Stream 404 at play time → `PreviewPlayer` already marks failed + skips.

## Testing / verification

- `tsc` + lint + `next build` clean.
- Preview: Home shows track shelves (no album grids) and they play; Genre pages
  show track lists with working preview + download (mapped) and downloadable rows
  (indie/ambient); album cards in search/artist no longer show the in-library
  chip; Library/Discover/playlists still render.
- Commit only the explicit Phase-2 paths; never `git add -A` (parallel
  uncommitted work present).

## Out of scope

The parallel `mixes`/recommendations feature. `LibraryItem`/`buildLibraryIndex`
stay (now largely internal); a later cleanup can remove them if fully unused.
