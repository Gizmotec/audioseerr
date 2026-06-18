# Track-first Library page

**Status:** Designed (not yet implemented)
**Date:** 2026-06-18

## Problem

The Library page (`/library`) shows whole-album tiles. Those tiles come from
`LibraryItem` — a derived index that `syncDownloadedLibrary` builds by
**collapsing every `DownloadedTrack` into one row per album**. Since the slskd
migration we download *individual songs*, so downloading a single track from an
album makes the **entire album** appear in the library (and the album page then
shows only the one track you actually own). The library no longer reflects what
you have.

The real, per-track truth already exists: `DownloadedTrack` (one row per
downloaded file) + `UserDownloadedTrack` (per-user visibility). The album page
and playlists already read it directly and stream it via
`/api/stream/local/[id]`. The Library page is the only consumer still reading
the album rollup.

## Decisions

1. **Library page reads `DownloadedTrack` directly**, scoped to the viewer via
   `UserDownloadedTrack` (admin sees all — same convention as
   `buildDownloadedTrackLookup`). One file = one row. Downloading one song shows
   exactly one track, never a phantom album.
2. **Flat track list, pure.** Every owned track is its own row, whether you own
   1 track or all 12 of an album. No "collapse complete albums" logic — one row
   type, simplest mental model, most consistent with the track-first direction.
3. **Default sort: recently added** (`DownloadedTrack.createdAt desc`), with a
   client-side toggle to *Artist* (artist → album → position) and *Title* (A–Z).
4. **Delete: both, admin-only.** A per-track remove (new action) and a
   remove-whole-album action (existing `deleteLibraryAlbumAction`), both behind
   the existing `canDelete = isAdmin` gate. Matches today's permissions.
5. **Contained scope.** `LibraryItem` / `syncDownloadedLibrary` and everything
   they feed — "In Library" badges (`search`/`discover`/`genre`/`artist`), Home
   shelves, most-played (`playHistory`), the in-flight one-time migration — stay
   **untouched**. Album-level badges and album/artist shelves are legitimately
   album-shaped and work as-is. Only `/library` changes.
6. **Landed tracks only.** In-flight TRACK requests are not shown here; download
   progress lives on the requests page / `DownloadProgressBar`.

## Architecture

No new tables, no new infrastructure. This is a contained rewrite of the three
files under `src/app/library/` plus one new server action. Playback, the stream
route, `LibraryItem`/sync, badges, Home, Discover, album & playlist pages are
all unchanged.

The closest existing template is the **playlist page**: it resolves
`DownloadedTrack` → `streamUrl` and renders a flat, queue-playable track list
through `PreviewPlayer.playQueue`. The new Library reuses that exact shape.

### Data flow

```
DownloadedTrack  ──(scoped by UserDownloadedTrack; admin = all)──►  rows
   rows.map → { id, title, artistName, albumTitle, albumMbid,
                albumPosition, coverUrl, durationMs, recordingMbid,
                streamUrl: `/api/stream/local/${id}` }
   → LibraryView (client) → playQueue(rows, index)
```

## Components

- **`src/app/library/page.tsx`** (rewrite) — server component.
  - Auth + setup guard (unchanged).
  - Fetch the viewer's `DownloadedTrack` rows. Admin → all rows; regular user →
    `where: { users: { some: { userId } } }` (mirror
    `buildDownloadedTrackLookup`'s scoping).
  - `select`: `id, title, artistName, albumTitle, albumMbid, albumPosition,`
    `coverUrl, durationMs, recordingMbid, createdAt`.
  - `orderBy: { createdAt: "desc" }` (default; client re-sorts on toggle).
  - Map each row to the view shape with `streamUrl = /api/stream/local/${id}`.
  - Header copy changes from "Albums in your Lidarr library" → tracks; count is
    "N tracks". Pass `canDelete = isAdmin`.
  - Empty state: "No tracks yet." (keep the dashed-border treatment).

- **`src/app/library/LibraryView.tsx`** (rewrite) — client component, the whole
  flat list (rows inlined, mirroring how `PlaylistDetail` inlines its rows
  rather than splitting a row component).
  - Controls row: search input (matches title / artist / album, normalized like
    today), **Play all** + **Shuffle** buttons, and a **sort toggle**
    (Recently added · Artist · Title).
  - Builds `QueueItem[]` from the filtered+sorted rows (same mapping as
    `PlaylistDetail`: `id, title, artistName, coverUrl, streamUrl, recordingMbid,
    albumMbid, durationMs`). Row click → `player.playQueue(queue, index)`;
    Play all → `playQueue(queue, 0)`; Shuffle → `playQueue(shuffle(queue), 0)`.
  - Active-row highlight + per-row play/pause via `player.isCurrent(id)` /
    `player.state` (same pattern as `PlaylistDetail`).
  - Admin rows carry a `⋯` menu with **Remove track** (primary) and **Remove
    whole album** (secondary), reusing the `LibraryAlbumTile` delete-menu
    pattern (click-outside / Esc / pending state) as an in-file sub-component.

- **`src/lib/actions/library.ts`** — add **`deleteLibraryTrackAction(downloaded
  TrackId)`**: admin guard → look up the row's `filePath` + `albumMbid` →
  `unlink` (best effort) → delete the `DownloadedTrack` (cascades
  `UserDownloadedTrack`) → `revalidatePath("/library")` and the affected
  `/album/[albumMbid]`. Reuse the existing `requireAdmin` / `deleteFiles`
  helpers. Keep `deleteLibraryAlbumAction` for the whole-album action.

### Files kept (NOT removed)

- **`src/app/library/LibraryAlbumTile.tsx`** — **kept**. It still exports the
  `LibraryTileItem` type and the album-tile component used by **Home**
  (`home/page.tsx`) and **`lib/playHistory.ts`** for their (legitimately
  album-level) shelves. The Library page simply stops importing it.

## Edge cases

- **No `recordingMbid`** (migrated/Lidarr-era tracks): row still plays (stream
  is keyed by `DownloadedTrack.id`, not mbid). `recordingMbid` is only used for
  scrobbling — omit it in the queue item when null, exactly as the album page
  does. Album link uses `albumMbid`, which is always present.
- **Duration unknown** (`durationMs` null): hide the duration, don't render
  `0:00`.
- **Cover missing**: Disc3 placeholder (existing pattern).
- **A track fails to stream** (404/codec): `PreviewPlayer` already marks it
  failed and skips on auto-advance; surface the same "unavailable" affordance
  the playlist row uses.
- **Non-admin**: no delete controls (unchanged from today's `canDelete`).

## Testing / verification

- `npm run build` (or `tsc`) + lint clean.
- Manual via preview:
  1. With one downloaded track from a multi-track album → library shows exactly
     **one** row, not the album.
  2. Click a row → it plays; next/prev walks the library queue.
  3. Play all / Shuffle start playback from the filtered list.
  4. Search filters by title/artist/album; sort toggle reorders.
  5. As admin: Remove track deletes that one file + row; the album page loses
     that track. Remove whole album clears all its tracks.
  6. Home, album page, playlists, badges still render (regression check that the
     `LibraryItem` consumers are untouched).
