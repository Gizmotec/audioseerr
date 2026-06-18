# Find Similar (song radio) — design

Date: 2026-06-18

Right-click any song → **Find Similar** → an instant "radio" station of songs
close to it starts playing. The station mixes songs you already own (play in
full, scrobble) with new songs you don't (play their 30s preview now, and are
auto-downloaded in the background so they're full-length next time).

This is Spotify-style **Song Radio**: ephemeral by default, with an optional
**Save as playlist**. It is *not* a saved entity unless you ask for one.

## Why this is mostly wiring

The recommendation engine already exists. `getPlaylistRecommendations`
(`src/lib/recommendations.ts`) is exactly the pipeline we need — Last.fm
`track.getsimilar` fan-out → score/dedupe → per-artist cap → Deezer enrich
(cover/preview/album/duration) → "in library?" annotation. Today it's seeded
from a whole playlist (≥3 tracks). Find Similar seeds it from the one song you
picked.

## Engine change (low risk)

Extract the core of `getPlaylistRecommendations` into a shared
`recommendFromSeeds(viewer, seeds, opts)`:

- `getPlaylistRecommendations` keeps working — it builds its seeds from the
  playlist (most-recent, one-per-artist, capped) and calls the shared core,
  then applies its existing library-first sort.
- Find Similar calls the same core with a single seed `[{ artist, track, mbid }]`
  and excludes the seed song itself.
- `PlaylistRecommendation` gains `downloadedTrackId: string | null` (the owned
  track's `DownloadedTrack` id, when `inLibrary`). The playlist add-flow ignores
  it; the station needs it to build a full-length stream URL
  (`/api/stream/local/{id}`) without a second query. It comes free from
  `listAvailablePlaylistTracks` (which already returns the id as `key`).

No behavior change to the playlist shelf.

## Station builder — `src/lib/findSimilar.ts`

`findSimilarStation(viewer, seed)`:

1. `recommendFromSeeds(viewer, [seed], { limit, excludeKeys })`.
2. Split into owned (`inLibrary`) and new, **interleave** so the station reads
   as one list (reuse the mixes interleave idea), then return the ranked
   `PlaylistRecommendation[]` plus a `title` (`Similar to {seed.title}`).

Bounds (constants): `STATION_SIZE ≈ 24`, `NEW_CAP ≈ 12`. The new portion is
capped so one right-click can't kick off an unbounded number of slskd
downloads. If you own lots of similar music the station is mostly owned (few
downloads); if you own little it tops out at ~12 new downloads.

Needs a Last.fm API key (same as the playlist shelf). No key → friendly error,
no station.

## Server actions — `src/lib/actions/findSimilar.ts`

- `findSimilarStationAction(seed)` → `{ title, recommendations }`. The one
  payload drives everything below.
- `autoDownloadStationAction(newTracks)` → resolves each new track to a
  MusicBrainz album+position and hands it to the existing slskd request path
  (`resolveSong` → `ensureTrackRequested`; idempotent, dedupes owned/in-flight).
  `Promise.allSettled`, best-effort, returns a count. Called by the client in
  the background right after playback starts, so the radio is instant and the
  downloads don't block it.
- `saveStationAsPlaylistAction(seedTitle, recommendations)` → `createPlaylist`
  ("Similar to X") + add every track, reusing the per-rec add/resolve logic
  already in `addRecommendationToPlaylistAction`.

All actions verify the session (Server Actions are POST-reachable).

## The right-click menu — `src/components/TrackMenu.tsx`

No context menu exists anywhere today, so this is the one genuinely new UI
primitive. One global provider, mounted in `layout.tsx` inside
`PreviewPlayerProvider` (it drives the player):

- `TrackMenuProvider` exposes `useTrackMenu().openTrackMenu(event, seed)` where
  `seed = { title, artistName, recordingMbid? }` — the minimal identity every
  song row already has in scope.
- Renders a single floating menu at the cursor (one instance, not one per row;
  closes on outside-click / Escape / scroll) with **Find Similar** (room to add
  "Add to playlist", "Like" here later).
- Renders a small fixed status snackbar (no toast lib exists): "Finding
  similar…" → "Playing 24 songs like *X* · downloading 12 new · [Save as
  playlist]", or a friendly error.

Each song row adds `onContextMenu={(e) => openTrackMenu(e, seed)}`. Surfaces
(all client components): Library, Playlists, Liked, Mixes, Album, Discovery,
Artist top-tracks, Playlist recommendations.

## Playback specifics

Reuses `playQueue` (already mixes full + preview, skips null `streamUrl`,
scrobbles only full library streams). Owned → `/api/stream/local/{id}`; new →
preview. The seed song is *not* forced as track 1 (keeps the seed shape uniform
across every surface); the label carries the context instead.

## Deliberately deferred

- **Live-upgrade preview → full mid-session** when a download lands (the player
  holds its queue in a ref and doesn't re-read item URLs once set). v1: new
  songs preview this session and are full next time. The two-action split leaves
  a clean seam to add this later.
- Touch/long-press trigger (desktop-first; right-click only for now).
