# Audioseerr REST API v1

Base path: `/api/v1` — e.g. `http://your-server:3000/api/v1/status`.

All endpoints return JSON. Errors are always shaped as:

```json
{ "error": "Human-readable message." }
```

with an appropriate 4xx/5xx status code.

## Authentication

Every endpoint except `GET /api/v1/status` requires a personal API key.
Send it in either header (both are equivalent; `Authorization` wins if both
are present):

```
Authorization: Bearer aks_0123456789abcdef0123456789abcdef01234567
x-api-key: aks_0123456789abcdef0123456789abcdef01234567
```

A missing or invalid key returns `401 { "error": "Invalid or missing API key." }`.

### Creating and managing keys

Sign in to the web UI and open **Account → API keys**
(`/account/api-keys`):

- **Create** — give the key a label (e.g. "phone script"). The full key is
  shown **exactly once** in a copy-able callout; only its SHA-256 hash is
  stored, so it can never be recovered. Store it somewhere safe.
- **List** — every key shows its display prefix (`aks_ab12cd34…`), label,
  creation date, and last-used date.
- **Revoke** — deletes the key immediately; anything using it gets 401s.

Keys act as *you*: they see your library view, your requests, and your quota.
Admin keys get the admin behaviors noted per-endpoint. There is no separate
scope system.

## Conventions

- Timestamps are ISO 8601 strings (e.g. `"2026-07-22T09:15:00.000Z"`),
  `null` when unset.
- List endpoints paginate with `take` (1–100, default 20) and `skip`
  (default 0), and return a bare JSON array — an empty array means you've
  paged past the end.
- `mbid` values are MusicBrainz UUIDs (release-group MBID for albums,
  artist MBID for artists, recording MBID for tracks).

---

## GET /api/v1/status

Service status. **Unauthenticated.**

```bash
curl http://localhost:3000/api/v1/status
```

```json
{ "status": "ok", "version": "0.1.0" }
```

## GET /api/v1/user

The key owner's profile.

```bash
curl -H "Authorization: Bearer $KEY" http://localhost:3000/api/v1/user
```

```json
{
  "id": "clxyz…",
  "username": "alex",
  "email": "alex@example.com",
  "role": "USER",
  "requestQuota": 20,
  "autoApproveArtist": false,
  "autoApproveAlbum": true,
  "autoApproveTrack": true
}
```

`requestQuota` is the per-week request limit (`0` = unlimited). The
`autoApprove*` flags mean new requests of that type skip the admin approval
queue.

## GET /api/v1/request

List requests, newest first. Regular users see only their own; admins can
pass `all=true` for a global listing.

Query params:

| Param    | Meaning                                                        |
|----------|----------------------------------------------------------------|
| `status` | Filter: `PENDING`, `APPROVED`, `DECLINED`, `DOWNLOADING`, `AVAILABLE`, `FAILED` |
| `take`   | Page size, 1–100 (default 20)                                  |
| `skip`   | Offset (default 0)                                             |
| `all`    | `true` = all users' requests (**admin only**; ignored otherwise) |

```bash
curl -H "Authorization: Bearer $KEY" \
  "http://localhost:3000/api/v1/request?status=PENDING&take=10"
```

```json
[
  {
    "id": "clxrq…",
    "type": "ALBUM",
    "mbid": "5f11e5c1-3c15-4c0d-9d0d-6b2a53f4f2f2",
    "title": "Random Access Memories",
    "artistName": "Daft Punk",
    "albumTitle": null,
    "status": "PENDING",
    "requestedAt": "2026-07-22T09:15:00.000Z",
    "approvedAt": null,
    "declineReason": null,
    "requestedById": "clxyz…"
  }
]
```

`type` is `ALBUM` | `ARTIST` | `TRACK`. `albumTitle` is set for `TRACK`
requests, `null` otherwise. Invalid `status`/`take`/`skip` → `400`.

## POST /api/v1/request

Create a request. Body (JSON):

| Field          | Type              | Required                                  |
|----------------|-------------------|-------------------------------------------|
| `type`         | `"ALBUM"` \| `"ARTIST"` \| `"TRACK"` | yes                       |
| `mbid`         | UUID              | ALBUM/ARTIST: yes. TRACK: optional — recording MBID when known |
| `albumMbid`    | UUID              | TRACK only                                |
| `albumPosition`| integer ≥ 1       | TRACK only (1-indexed position on the album) |

Title/artist/artwork are resolved from MusicBrainz server-side — the API does
not accept client-supplied metadata. For TRACK, the stored `mbid` is the
recording MBID (MusicBrainz's own when the album lookup provides one), falling
back to the synthetic `<albumMbid>:<albumPosition>` key.

Status codes:

- `201` — created; the body is the created row (same shape as the list
  endpoint). If the media was already in the library the row comes back
  `AVAILABLE` immediately. If your `autoApprove*` flag covers the type, the
  download dispatch runs inline and the row reflects the outcome
  (`APPROVED`/`DOWNLOADING`, or `FAILED` with the reason queryable via GET).
- `400` — validation failed, or the MBID/track position couldn't be resolved
  on MusicBrainz.
- `403` — weekly request quota exceeded (`requestQuota` per 7 days;
  `0` = unlimited; admins are exempt).
- `409` — you already have an in-flight or fulfilled request for this item
  (`DECLINED`/`FAILED` requests may be re-submitted).

```bash
curl -X POST -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"type": "ALBUM", "mbid": "5f11e5c1-3c15-4c0d-9d0d-6b2a53f4f2f2"}' \
  http://localhost:3000/api/v1/request
```

```json
{
  "id": "clxrq…",
  "type": "ALBUM",
  "mbid": "5f11e5c1-3c15-4c0d-9d0d-6b2a53f4f2f2",
  "title": "Random Access Memories",
  "artistName": "Daft Punk",
  "albumTitle": null,
  "status": "PENDING",
  "requestedAt": "2026-07-22T09:16:11.000Z",
  "approvedAt": null,
  "declineReason": null,
  "requestedById": "clxyz…"
}
```

Track example:

```bash
curl -X POST -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"type": "TRACK", "albumMbid": "5f11e5c1-3c15-4c0d-9d0d-6b2a53f4f2f2", "albumPosition": 5}' \
  http://localhost:3000/api/v1/request
```

## GET /api/v1/request/{id}

Fetch one request by id. Yours only; admins can read anyone's. Anything else
returns `404` (existence is not leaked).

```bash
curl -H "Authorization: Bearer $KEY" http://localhost:3000/api/v1/request/clxrq…
```

Response shape is identical to a list-endpoint row.

## GET /api/v1/library

The caller's track library, newest first — the same visibility rules as the
web Library page: regular users see the tracks they've requested or been
granted; admins see every downloaded track.

Query params: `take` (1–100, default 20), `skip` (default 0).

```bash
curl -H "Authorization: Bearer $KEY" "http://localhost:3000/api/v1/library?take=5"
```

```json
[
  {
    "id": "clxdt…",
    "title": "Get Lucky",
    "artistName": "Daft Punk",
    "albumTitle": "Random Access Memories",
    "albumMbid": "5f11e5c1-3c15-4c0d-9d0d-6b2a53f4f2f2",
    "albumPosition": 5,
    "coverUrl": "https://coverartarchive.org/release-group/5f11e5c1-…/front-250",
    "durationMs": 369000,
    "recordingMbid": "2f7f8b3d-…"
  }
]
```

## GET /api/v1/search

Search MusicBrainz (the same rate-limited, cached backend the web search
uses). Unlike the web UI, queries are **not** added to your recent searches.

Query params: `q` (required) — artist or album text.

```bash
curl -H "Authorization: Bearer $KEY" \
  "http://localhost:3000/api/v1/search?q=random%20access%20memories"
```

```json
{
  "query": "random access memories",
  "artists": [
    {
      "mbid": "056e4f3e-d505-4dad-8ec1-d04f521cbb56",
      "name": "Daft Punk",
      "type": "Group",
      "country": "FR",
      "score": 100
    }
  ],
  "albums": [
    {
      "mbid": "5f11e5c1-3c15-4c0d-9d0d-6b2a53f4f2f2",
      "title": "Random Access Memories",
      "artistName": "Daft Punk",
      "artistMbid": "056e4f3e-d505-4dad-8ec1-d04f521cbb56",
      "firstReleaseDate": "2013-05-17",
      "primaryType": "Album",
      "coverUrl": "https://coverartarchive.org/release-group/5f11e5c1-…/front-250"
    }
  ]
}
```

`400` when `q` is missing/empty; `502` when MusicBrainz fails upstream. The
`mbid` values here are exactly what `POST /api/v1/request` accepts.
