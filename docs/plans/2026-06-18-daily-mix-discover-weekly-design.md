# Daily Mix & Discover Weekly — design

Date: 2026-06-18

Two taste-based mixes on the discovery page, presented as featured cards that
open into a full playlist-style view.

## What each mix is

- **Daily Mix** — ~30 tracks, refreshes once per calendar day.
  - **70% familiar**: tracks already in the user's library (`DownloadedTrack`),
    weighted toward most-played and liked, with day-seeded rotation. These play
    in full off `/api/stream/local/{id}` and scrobble.
  - **30% new**: tracks the user doesn't own, close to taste — top tracks from
    artists they already play/like (plus a light hop to similar artists). 30s
    Deezer previews + a Request button.
- **Discover Weekly** — ~30 tracks, refreshes every ISO week (Monday).
  - **100% new**: artists the user has never played, drawn from artists similar
    to their taste. 30s previews + Request.

Both are discovery surfaces (nothing is auto-downloaded); the user requests
tracks they like. Daily Mix's familiar 70% is the only part that streams in full.

## Taste profile (seed)

- **Top artists**: `PlayHistory` grouped by `artistName` (denormalized), ranked
  by play count.
- **Likes**: `getAllLikes(userId)` — ARTIST/ALBUM/TRACK likes contribute their
  `artistName`, weighted above plays.
- Combined, deduped → seed artist list.

## Recommendation pipeline (`src/lib/mixes.ts`)

- **Familiar pool** (Daily): viewer-scoped `DownloadedTrack` list (same query as
  the library page; admins see all). Score by play count + like boost; take the
  top slice, then a periodKey-seeded shuffle for rotation.
- **New pool**: `getDeezerArtistBundle(artist)` (cached 7d) yields top tracks
  (with previews) and similar artists in one call.
  - Daily-new: seed artists' top tracks (+ light similar), minus owned/played.
  - Weekly: seed artists → similar artists the user has *not* played → their top
    tracks, ≤2 per artist, minus owned/played.
- **Exclusion sets**: normalized `artist|title` of owned + played tracks; for
  Weekly also a set of played/owned artist names.
- **Cold start** (no plays/likes): fall back to Deezer global/genre chart tracks
  + Most Loved so the mixes are never empty.
- **Determinism**: a periodKey+userId-seeded PRNG drives all shuffles so a mix is
  stable within its period even on a cache miss.

## Storage / refresh

- No schema change. Cache each generated mix in the existing `ApiCache` table via
  `withCache`, key `mix:{kind}:{userId}:{periodKey}`, TTL = seconds to end of the
  period. First page view of the day/week generates; the rest read cache.
- `periodKey`: `YYYY-MM-DD` (daily) / `YYYY-Www` ISO week (weekly).

## UI

- **Discover page**: two featured `MixCard`s near the top, each in its own
  `<Suspense>` boundary so generation streams in (skeleton meanwhile) and never
  blocks the rest of the page. Cover = 2x2 mosaic of up to 4 track covers
  (mirrors the Liked Songs pattern).
- **Full view** `src/app/mix/[kind]/page.tsx`: header (cover, title, subtitle,
  Play all) + `MixDetail` client component.
- **MixDetail**: builds one `QueueItem[]` for the whole mix; "Play all" and each
  row play via `playQueue`. Library rows carry `streamUrl` + scrobble ids and
  show an "In library" marker; new rows carry the preview as `streamUrl` (no
  scrobble) and a Download button wired to the existing
  `requestDiscoveryTrackAction`.

## Reuse

- Player: `usePreviewPlayer().playQueue` (mixed full/preview already supported).
- Request: `requestDiscoveryTrackAction` (new tracks are `DiscoveryTrack`-shaped).
- Cache: `withCache`; cover mosaic: Liked Songs `coverUrls` pattern.
