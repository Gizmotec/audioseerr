# Pre-download discovery mixes (temporary, engagement-retained) — design

Date: 2026-06-19

A settings toggle that eagerly pre-downloads the Daily Mix and Discover Weekly
"new" tracks into **temporary** storage so they play full-length instantly.
Tracks the user doesn't engage with (like / add to a playlist) are auto-deleted.

Decisions (from brainstorming): **eager** pre-download, on a **scheduled** cron
job, with temp tracks **hidden until kept**, fixed retention window (no config
knob beyond the on/off toggle).

## Data model

- `DownloadedTrack` += `ephemeral Boolean @default(false)`, `expiresAt DateTime?`.
  A real library track keeps the defaults, so it's never at risk.
- `Request` += `ephemeral Boolean @default(false)`, `expiresAt DateTime?` — so
  the "this is a temp fetch" intent survives the async request→download pipeline
  (the `DownloadedTrack` doesn't exist until Soulseek finishes).
- `Settings` += `preDownloadMixes Boolean @default(false)` — the toggle.

## Ephemeral flow

`ensureTrackRequested(userId, input, opts?)` gains `opts.ephemeral` /
`opts.expiresAt`:
- Creates the `Request` carrying those flags.
- `registerDownloadedTrack` → `upsertDownloadedTrack` propagates them: **create**
  sets `ephemeral`/`expiresAt`; **update** path graduates (sets
  `ephemeral=false, expiresAt=null`) when the landing request is *non-ephemeral*,
  and never downgrades a permanent track to ephemeral.

## Graduation (keep → permanent) — one hook

Both retention signals already route through `ensureTrackRequested`:
- **Like** → `toggleTrackLikeAction` calls it.
- **Add to playlist** → `autoFetchMissing` calls it.

So the single rule — *a non-ephemeral `ensureTrackRequested` clears `ephemeral`
on the matching `DownloadedTrack` (and on any in-flight `Request`)* — graduates
on both. The prune job re-checks like/playlist membership as a safety net, so a
kept track can never be deleted even if the inline hook is raced.

## Hidden until kept

Ephemeral tracks stay *streamable* (mix views play them full via
`/api/stream/local/{id}`; `viewerCanStreamTrack` only checks the user-attach) but
are excluded from every **listing/index** query with `ephemeral: false`:
- `listAvailablePlaylistTracks` (Library view + playlist picker)
- Home shelves (recently added / played / most played)
- downloaded-track search
- **`syncDownloadedLibrary`** (the 5-min album-index job) — critical, or temp
  albums surface into `LibraryItem` → Home/badges.

## Mix render-time upgrade

The cached mix bakes "new vs library" at generation time, so a pre-downloaded
"new" track must be upgraded to full playback at **render** time. `mix/[kind]/
page.tsx` builds a viewer-scoped lookup of `DownloadedTrack` (including
ephemeral) keyed by normalized `artist|title`; `MixDetail` sets a full
`streamUrl` (and a "Temporary" marker) for any "new" track that matches, instead
of the 30s preview + Download button.

## Jobs (`src/lib/jobs/`)

- `preloadMixes(kind)` — gated on `settings.preDownloadMixes` (+ a Last.fm key).
  For each user: `getOrGenerateMix(viewer, kind)` (warms the cache the page
  reads), then for each `kind:"new"` track `resolveSong` → `ensureTrackRequested`
  with `ephemeral:true` and `expiresAt` = now + 2d (daily) / 8d (weekly). Capped
  per run.
- `pruneEphemeralTracks()` — daily. Graduates any ephemeral track that's now
  liked or in a playlist (safety net); deletes the rest whose `expiresAt < now`
  (file unlink + `DownloadedTrack` row + cascade `UserDownloadedTrack` + the
  originating `Request`). Only ever touches `ephemeral=true` rows.
- Cron registration in `jobs/index.ts`: daily `0 5 * * *` → `preloadMixes("daily")`
  + `pruneEphemeralTracks()`; Monday `0 5 * * 1` → `preloadMixes("weekly")`.

## Settings UI

`Settings.preDownloadMixes` through `getSettings`/`SettingsUpdate`/`saveSettings`
and a toggle in `SettingsForm`. Disabled → preload no-ops; prune still runs so
turning it off cleans up.

## Safety

Deletion only ever targets `ephemeral=true` rows, and only after re-confirming no
like and no playlist membership. Real library tracks (`ephemeral=false`) are
structurally out of scope of the prune query.
