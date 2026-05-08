# Personalized suggestions on Discover

## Goal

Surface tailored recommendations at the top of `/discover` for users who've built up signal in Audioseerr (likes, library, listening history). New users see today's discover unchanged.

## Non-goals (v1)

- No collaborative filtering. All similarity is artist/track-seeded via Last.fm.
- No "thumbs down" / "not interested" feedback.
- No personalization on `/home`.
- No play tracking for previews — only full streams from `/api/stream/[trackFileId]`.

## Sections on the page

After the search bar, before the existing global charts:

1. **Recommended for you** (hero row) — blends the three reason rows below; 12 albums, deduped by `(artistName, albumMbid)`, light shuffle.
2. **Because you liked [Artist]** — pick the user's most-recent liked artist (or top artist among liked albums/tracks); fetch ~10 similar artists from Last.fm; pick one representative recent album per artist; filter out anything already in the Lidarr library.
3. **More from artists in your library** — pick ~5 artists with the most albums in `LibraryItem`; fetch their full release-group list from MusicBrainz; show albums not in the library, ranked newest first.
4. **New releases from your library artists** — same as above, filtered to release date within the last 18 months.

Cold start (zero signal) → all four rows are hidden. Existing global charts cover the page.

## Data model

```prisma
model PlayEvent {
  id            String   @id @default(cuid())
  userId        String
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  recordingMbid String
  albumMbid     String
  artistName    String
  trackFileId   Int
  playedAt      DateTime @default(now())

  @@index([userId, playedAt])
  @@index([userId, artistName])
}

// User additions:
personalizedSuggestionsEnabled Boolean @default(true)
```

`trackFileId` lets the server reject "same track within 60 seconds" duplicates. `artistName` denormalized for fast group-by without a join.

## Play tracking

**When does a play count?** 30 seconds OR halfway through, whichever comes first. Implemented in the `PreviewPlayer` provider:

- Extend `QueueItem` with optional `tracking?: { recordingMbid, albumMbid, artistName, trackFileId }`. Items without it (Deezer previews) never fire.
- On `playing`, schedule a one-shot timer for `min(30_000, durationMs / 2)`.
- When it fires (and the same item is still playing), POST to `/api/plays` with the tracking payload.
- Cleared on track change / pause-then-skip / unmount.

**Server endpoint** `POST /api/plays`:
- Auth required.
- Reject if `personalizedSuggestionsEnabled === false` for the user.
- Dedupe: skip insert if a row exists for `(userId, trackFileId)` within the last 60s.
- Otherwise insert. Returns 204.

## Recommendation sources

- **Last.fm** — `artist.getSimilar` (new endpoint to add). Returns artists with similarity scores. Cached 24h.
- **MusicBrainz** — already-used `getArtist(mbid)` returns release-groups for that artist.
- **Library** — Prisma `LibraryItem` is the source of truth for "what does the user already have."

All three reason-row generators run with per-user 6-hour TTL via `ApiCache`. Cache key: `personalized:v1:${rowName}:${userId}`.

## Opt-out

New `/account/preferences` page (the first per-user settings page in the app):

- Toggle: "Show personalized suggestions on Discover" (default ON).
- Button: "Clear listening history" — deletes all `PlayEvent` rows for the user.

When toggled OFF:
- Discover hides personalized rows (same code path as cold start).
- `POST /api/plays` rejects with 204 (silent no-op).
- Existing `PlayEvent` rows are preserved unless the user explicitly clears them.

## Discover page changes

`src/app/discover/page.tsx`:
- Read `User.personalizedSuggestionsEnabled` from session.
- If enabled, run `getPersonalizedSections(userId)` in the existing `Promise.all`.
- Render returned rows between the search bar and "Top new releases" when non-empty.
- A new client component `PersonalizedSection` renders the four rows using the existing `DiscoveryRow` tile pattern.

## Caching, freshness, errors

- Per-user 6h cache for each row + the hero blend.
- A failed Last.fm/MB call returns an empty row, never blocks the page. The unaffected rows render.
- Existing `withCache` infra used; no new cache primitives.

## Out of scope for v1 (deferred)

- Genre-based row.
- "Because you've been playing X" — schema is in place but row is not built; will fold into hero blend once data accumulates.
- Real-time recompute when user likes/plays something new (cache TTL handles this gracefully).
- Admin visibility into individual user plays.
