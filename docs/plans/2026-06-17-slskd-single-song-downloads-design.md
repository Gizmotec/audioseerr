# Single-song downloads via Soulseek (slskd)

**Status:** Phase 1 implemented · Phases 2–3 planned
**Date:** 2026-06-17

## Problem

Listening has shifted from albums to playlists, and playlists need *individual
songs*. The original track-download path searched **Prowlarr** for
`"{artist} {track}"` and handed a torrent to **qBittorrent** — but torrent
indexers almost never carry single tracks (music torrents are whole albums or
discographies). So single-track requests reliably failed with
`Prowlarr returned no results`. The error wasn't a bug in the query; it was the
wrong *source* for single songs.

Beyond sourcing, the old track path was also disconnected from playback:
playability in Audioseerr is entirely Lidarr-mediated (a track is playable only
if Lidarr has a `trackFileId` for it), and a qBittorrent download landed in a
folder Lidarr never saw — so even a successful download was never playable or
addable to a playlist.

## Decisions

1. **Source = Soulseek (slskd).** Soulseek shares *individual files*, which is
   exactly what playlists need. slskd is a small container with a clean REST API.
2. **Audioseerr owns a track library.** Rather than feeding singles back into
   Lidarr (which is fiercely album-centric and fights single-track imports), a
   new `DownloadedTrack` table is Audioseerr's own single-track library, served
   directly off disk. This matches the product's track-first direction.
3. **Playlist-first UX.** Adding *any* track to a playlist — even one we don't
   have — is allowed; undownloaded tracks auto-fetch via slskd and flip to
   playable when they land.
4. **Drop Lidarr entirely, phased.** The end state is slskd-only for both
   singles and albums, collapsing the stack from
   Lidarr + Prowlarr + qBittorrent + slskd down to **just slskd** (+ MusicBrainz
   for metadata). We phase it so the working album path is never broken before
   the slskd path is proven. Artist auto-monitoring (Lidarr's "follow an artist")
   is dropped for now.

## Architecture

Playability gains a second source alongside Lidarr:
> A track is playable if **Lidarr** has its file (existing) **or** a
> `DownloadedTrack` row exists for it (new).

New pieces:

- **`src/lib/slskd.ts`** — slskd REST client: async search, candidate scoring,
  enqueue, transfer polling, state classification.
- **`DownloadedTrack` + `UserDownloadedTrack`** — Audioseerr's track library and
  its per-user visibility partition (the singles analog of
  `LibraryItem` / `UserLibraryItem`).
- **`src/lib/downloadedTracks.ts`** — resolve a finished download to a file on
  disk, register it, viewer-scoped lookups, stream authorization.
- **`/api/stream/local/[id]`** + **`src/lib/fileStream.ts`** — serve a
  `DownloadedTrack` off disk with HTTP Range/seek support.
- **`src/lib/trackRequests.ts`** — `ensureTrackRequested` (idempotent auto-fetch)
  + `getActiveTrackRequestKeys` (for the "fetching" badge).

## Data model

`DownloadedTrack` (available-only library; presence ⇒ playable):
`id, recordingMbid?, albumMbid, albumPosition, title, artistName, albumTitle?,
coverUrl?, durationMs?, filePath, format?, bitrate?, sizeBytes?, createdAt`.
Unique on **(albumMbid, albumPosition)** — every track request originates from an
album page so both are always known, and the album page joins on absolute
position (the same key Lidarr's `buildTrackFileLookup` uses). `recordingMbid` is
indexed for the playlist join.

`UserDownloadedTrack` — `(userId, downloadedTrackId)` unique; mirrors
`UserLibraryItem`. The file is stored once; this partitions who can see/stream it.

`Request` stays the lifecycle/approval record (the UI + sync read `Request.status`
as the single source of truth). Added `slskdUsername` + `slskdFile` to hold the
in-flight transfer handle. `PlaylistTrack.trackFileId` is now nullable (a
playlist can hold a not-yet-downloaded track, or one served from our own library).

## Download pipeline (one engine, singles now; albums in Phase 2)

1. **Search** — slskd searches are async: POST `/searches`, poll
   GET `/searches/{id}` until `isComplete` (bounded ~8s), then
   GET `/searches/{id}/responses`.
2. **Score & pick** (`rankTrackCandidates`) — drop candidates whose title tokens
   don't match or whose duration is >30s off the MusicBrainz length (kills
   remix/live/extended/mislabel). Among survivors: prefer lossless > 320 > lower;
   bonus for tight duration match, free upload slot, speed; penalize
   live/remix/instrumental unless requested. **Duration match is the strongest
   correctness signal.**
3. **Enqueue** — POST `/transfers/downloads/{username}` with `[{filename,size}]`;
   persist `slskdUsername` + `slskdFile`; status → `DOWNLOADING`.
4. **Poll** — the 2-min `syncActiveRequests` job calls
   `getDownloadTransfer`; `classifyTransfer` maps the comma-string state
   (`"Completed, Succeeded"` ⇒ done; `Errored/Cancelled/…` ⇒ failed).
5. **Register** — on done, `resolveDownloadedFilePath` locates the file under the
   (path-mapped) slskd download dir; `registerDownloadedTrack` upserts the
   `DownloadedTrack` + attaches the requester; status → `AVAILABLE`. If the file
   hasn't landed yet, stay `DOWNLOADING` and retry next tick.

**Retry/fallback:** Phase 1 marks a failed transfer `FAILED` with a reason; the
user/admin can retry (re-approve re-runs the search). Auto-fallback to the
next-best peer is the immediate follow-up.

## Playback, playlists, visibility

- **Stream route** serves both Lidarr files (`/api/stream/{trackFileId}`) and our
  own files (`/api/stream/local/{downloadedTrackId}`), reusing one Range-serving
  helper. Local streaming is gated by `viewerCanStreamTrack` and bounds-checked
  against the slskd download root.
- **Album page** merges a viewer-scoped `DownloadedTrack` lookup so locally
  downloaded singles render as playable + addable to a playlist, independent of
  Lidarr's album-level library status.
- **Playlists** — adding an undownloaded track is allowed and triggers
  `ensureTrackRequested` (idempotent; cross-user dedup attaches to an existing
  file instead of re-downloading). The playlist page badges in-flight tracks
  **"downloading"** and streams local copies when ready.
- **Visibility** — a `DownloadedTrack` file is global on disk; `UserDownloadedTrack`
  controls who can see/stream it. Admins bypass the filter.

## Phased rollout

- **Phase 1 (done).** slskd singles pipeline, `DownloadedTrack` library, local
  streaming, album-page playability, playlist add-undownloaded + auto-fetch,
  slskd settings UI. Lidarr still serves albums. Old Prowlarr+qBittorrent *track*
  path removed (those services remain only behind Lidarr for albums).
- **Phase 2.** Albums via slskd: search/download a full album folder (match track
  count + durations against MusicBrainz), register each track as a
  `DownloadedTrack`. Both flows then feed one library.
- **Phase 3.** Migrate the existing Lidarr library → `DownloadedTrack` rows
  pointing at existing files; switch streaming + playability fully local; delete
  Lidarr/Prowlarr/qBittorrent code, settings, and the Lidarr-synced tables.

## slskd API reference (verified)

Base `{url}/api/v0`; auth header `X-API-Key`.

| Operation | Method + path | Notes |
|---|---|---|
| Start search | `POST /searches` | body `{ searchText, searchTimeout, filterResponses }` → `{ id }` |
| Poll search | `GET /searches/{id}` | has `isComplete` |
| Search results | `GET /searches/{id}/responses` | `[{ username, hasFreeUploadSlot, uploadSpeed, queueLength, files:[{ filename, size, bitRate, length, extension, isLocked }] }]` |
| Enqueue download | `POST /transfers/downloads/{username}` | body `[{ filename, size }]` |
| Poll transfers | `GET /transfers/downloads/{username}` | `directories[].files[]` each `{ id, filename, state, percentComplete, bytesTransferred }` |

Transfer `state` is a comma string: `"Completed, Succeeded"` (done),
`"Completed, Errored"` / `"Completed, Cancelled"` (failed), `"InProgress"`,
`"Queued, Remotely"`.

## Known follow-ups

Hardened after an adversarial review of the diff:
- **Done.** Age-based FAILED guard so a track request can't sit in `DOWNLOADING`
  forever (vanished transfer, or "done" but file unlocatable) + a diagnostic log.
- **Done.** Inline slskd search on the auto-approve playlist-add path is now
  detached, so adding a track returns immediately (the "fetching" badge still
  shows; approval resolves in the background).
- **Done.** File resolution tolerates slskd's filename sanitization via a
  normalized-basename fallback.
- **Done.** slskd HTTP errors keep their response body so the admin-facing
  failure reason is meaningful.

Still open (consciously deferred — low impact):
- Auto-fallback to the next-best peer when a transfer errors mid-flight (today:
  FAILED + manual retry re-runs the search).
- When MusicBrainz omits a track length, pass the Deezer duration into the
  scorer so the duration reject still applies (currently skipped if either side
  lacks a length).
- Persist `durationMs`/`bitrate` on `DownloadedTrack` (columns exist; no consumer
  reads them yet).
- Guard the `(albumMbid, albumPosition)` upsert against overwriting a conflicting
  `recordingMbid` (narrow, data-drift-only case).
- Bound auto-fetch concurrency for future bulk-add surfaces.
- Transcoding browser-unfriendly formats (scoring already prefers streamable
  formats).
