# Audioseerr — Design Document

**Date:** 2026-05-03
**Status:** Approved for v1 build
**Author:** Alex (with brainstorming assistance)

---

## 1. Background & motivation

The *arr ecosystem (Lidarr, Radarr, Sonarr) has a polished request-management frontend for movies and TV shows in **Overseerr** / **Jellyseerr**. Nothing equivalent exists for music.

Lidarr's built-in UI is functional but ugly, designed around library management rather than discovery. Users who want to:

- Browse charts and trending music
- Discover new artists/albums in a Spotify-like UX
- Hear a 30-second preview before committing to a download
- Submit a download request that an admin approves

…have no good option today. They have to manually search MusicBrainz, copy IDs into Lidarr, and hope the metadata is right.

**Audioseerr** fills this gap: a self-hosted, multi-user "Overseerr for music" with a discovery-first UI that integrates with Lidarr for the actual downloads.

## 2. Goals & non-goals

### Goals

- **Discovery-first UX** modeled on Spotify's browse experience (charts, genres, search, similar-to)
- **30-second preview playback** so users can audition tracks before requesting
- **Multi-user with admin approval** workflow, matching Overseerr's mental model
- **Self-hostable in one Docker container**, with multi-arch builds for ARM (Raspberry Pi)
- **Follows *arr ecosystem conventions** so homelab users feel at home and a future maintainer from that community can pick it up easily
- **No paid APIs, no OAuth gymnastics** — use only free public APIs

### Non-goals (v1)

- Built-in playback / streaming of the user's full library (Navidrome, Jellyfin, Plexamp already do this well)
- Sonarr / Radarr integration — this is a music-only app; scope discipline matters
- Mobile native apps (responsive web is enough)
- i18n / localization (English only at launch)
- Email / SMTP integrations (huge friction for self-hosters; admin-mediated flows are fine)
- Personalized algorithmic recommendations (deferred to v2 — needs request history first)

## 3. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js (App Router) + TypeScript** | Largest AI training corpus, full-stack in one project, matches Jellyseerr |
| UI | **Tailwind CSS + shadcn/ui** | Modern, copy-paste-friendly, easy for AI-assisted iteration |
| Auth | **Auth.js (NextAuth v5)** | Pluggable providers — credentials now, Plex/Jellyfin OAuth later |
| Database | **SQLite + Prisma** | Single-file backup, perfect for self-hosted, type-safe ORM |
| Data fetching | **TanStack Query** | Caching, optimistic updates, retry-on-focus |
| Background jobs | **node-cron** in `instrumentation.ts` | In-process, no extra worker container |
| Container | **Docker** (multi-arch: amd64, arm64) | Homelab standard |

### Why this stack specifically

- **AI-assistance friendly.** Audioseerr will be built primarily by a non-developer working with Claude Code. TypeScript + Next.js has the most comprehensive training data of any stack, the best type safety to catch AI mistakes, and the largest ecosystem of copy-able patterns (including Jellyseerr itself, which is open source).
- **Future maintainer accessibility.** When the project is handed off to a community maintainer, the largest possible pool of qualified developers is TypeScript-comfortable. Following Jellyseerr's stack gives that maintainer a familiar reference codebase.
- **Single container deploy.** Self-hosters reward "drop-in" simplicity. One image, one volume, one port.

### Stacks explicitly rejected

- **Go** — better runtime, much smaller AI ecosystem, harder for a non-dev solo
- **Python** — fine, but frontend/backend language split adds cognitive overhead
- **C# / .NET** — would fit *arr conventions, but smaller ecosystem of UI libraries and harder to find homelab maintainers
- **Microservices** — wildly overkill for v1
- **Postgres** — overkill, hurts the drop-in self-host story

## 4. External data sources

| Source | Used for | Auth | Rate limits |
|---|---|---|---|
| **MusicBrainz** | Canonical IDs, artist/album/track metadata, search | None | 1 req/sec (strict, requires User-Agent) |
| **Last.fm** | Charts, trending, "similar to", artist bios, genre tags | API key (free) | 5 req/sec |
| **Deezer** | Album art, 30s previews, related artists, charts fallback | None for read endpoints | Generous |
| **Lidarr** | The actual download backend | API key (user supplies) | None — local network |

### Why this combination

- **MusicBrainz IDs as canonical identifiers everywhere.** Lidarr internally uses MBIDs, so any other choice creates a mapping headache.
- **Last.fm uniquely provides similarity data + charts.** It's the only free source with rich "similar to X" relationships and chart data.
- **Deezer for art and previews** because it has no auth requirement and reliable preview URLs.
- **Spotify deliberately avoided.** Best metadata, but: OAuth per user is painful for self-hosted; ToS is gray for download-adjacent apps; creates single-vendor dependency.

### Future option

**ListenBrainz** is an open-source alternative to Last.fm. Worth considering as a swap-in if Last.fm's API ever degrades, and as a source of "loved tracks" for v2's recommendation engine.

## 5. Architecture

### System topology

```
┌─────────────────────────────────────────────┐
│  Audioseerr container                       │
│  ┌───────────────────────────────────────┐  │
│  │  Next.js app (App Router)             │  │
│  │  • React UI (Tailwind + shadcn/ui)    │  │
│  │  • API routes                         │  │
│  │  • Background worker (node-cron)      │  │
│  └───────────────────────────────────────┘  │
│  ┌───────────────────────────────────────┐  │
│  │  SQLite (Prisma) → /config/db.sqlite  │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
            │
            ▼
   ┌───────────────────┐    ┌──────────────┐    ┌──────────┐
   │  Lidarr           │    │ MusicBrainz  │    │  Deezer  │
   │  (user-hosted)    │    │ Last.fm      │    │   API    │
   └───────────────────┘    └──────────────┘    └──────────┘
```

### Key flows

- **Discovery:** UI → Audioseerr API → check `ApiCache` table → if miss, query external API → cache → return
- **Request:** User clicks Request → row in `Request` table (status PENDING) → admin approves → POST to Lidarr API (add artist + album + trigger search) → background job polls Lidarr to update status → user sees AVAILABLE
- **Library awareness:** Background job pulls Lidarr library every 15 min into `LibraryItem` snapshot → "in library" badges everywhere

## 6. Data model

```prisma
model User {
  id            String   @id @default(cuid())
  email         String   @unique
  username      String   @unique
  passwordHash  String
  role          Role     @default(USER)   // USER | ADMIN
  requestQuota  Int      @default(20)     // per week, 0 = unlimited
  createdAt     DateTime @default(now())
  requests      Request[]
}

model Request {
  id              String        @id @default(cuid())
  type            RequestType                       // ALBUM | ARTIST
  mbid            String                            // MusicBrainz ID
  title           String                            // denormalized for display
  artistName      String                            // denormalized for display
  coverUrl        String?
  status          RequestStatus @default(PENDING)
  // PENDING | APPROVED | DECLINED | DOWNLOADING | AVAILABLE | FAILED
  requestedById   String
  requestedBy     User          @relation(fields: [requestedById], references: [id])
  requestedAt     DateTime      @default(now())
  approvedAt      DateTime?
  declineReason   String?
  lidarrId        Int?
  qualityProfileId Int?
  @@index([status])
  @@index([requestedById])
}

model LibraryItem {
  mbid          String   @id
  lidarrId      Int      @unique
  status        String                  // "downloaded" | "missing" | "wanted"
  artistName    String
  title         String
  lastSyncedAt  DateTime
}

model Settings {
  id                     Int     @id @default(1)   // singleton
  lidarrUrl              String?
  lidarrApiKey           String?  // encrypted at rest with SOUNDSEERR_SECRET
  lidarrDefaultProfileId Int?
  lidarrRootFolderPath   String?
  lastFmApiKey           String?
  requireApproval        Boolean @default(true)
  registrationMode       String  @default("CLOSED")
  // CLOSED | OPEN | OAUTH_ONLY
  setupComplete          Boolean @default(false)
}

model ApiCache {
  key       String   @id           // e.g. "lastfm:chart.gettoptracks:1"
  value     String                 // JSON blob
  expiresAt DateTime
  @@index([expiresAt])
}

model Invite {
  token       String   @id
  createdById String
  expiresAt   DateTime
  usedAt      DateTime?
  usedById    String?
}
```

### Design decisions

- **MBID-first.** Every entity that has a MusicBrainz analog uses MBID as primary key or canonical reference.
- **No Artist/Album/Track tables in v1.** The metadata lives in `ApiCache` (TTL'd) and we denormalize display fields onto `Request` and `LibraryItem`. Simpler, lower sync burden, leans on source-of-truth APIs. Add proper tables in v2 if querying needs grow.
- **Singleton settings row.** Easier than scattered key/value config; fewer migrations.
- **Encryption at rest.** Lidarr API key encrypted with a key derived from `SOUNDSEERR_SECRET` env var. A leaked DB file isn't immediately exploitable.

## 7. Discovery features

### Pages

- **`/`** — Discover home: New Releases, Trending Now, Top Albums Globally, Browse by Genre. Personalized rows in v2.
- **`/search?q=`** — Tabbed search (Artists / Albums / Tracks), MusicBrainz-backed, Deezer art enrichment.
- **`/artist/[mbid]`** — Hero with image + bio, Top Tracks (with previews), Discography grouped by type, Similar Artists, "Request Artist" button.
- **`/album/[mbid]`** — Cover hero, tracklist with inline previews, Similar Albums, sticky "Request Album" button. "In your library" badge if already in Lidarr.
- **`/genre/[tag]`** — Top artists + top albums + trending in tag.
- **`/requests`** — User's request history with status filters.
- **`/admin/requests`** — Admin approval queue, one-click approve / decline-with-reason.
- **`/admin/users`** — User management.
- **`/account`** — Per-user profile and password change.
- **`/setup`** — First-run wizard.

### Cross-cutting UX

- Dark mode default, toggle for light
- Mobile responsive (people request from phones)
- Persistent global preview player at bottom of viewport
- "In library" badges everywhere a requestable item appears

## 8. Request flow & Lidarr integration

### Lifecycle

```
User clicks Request → Request row (PENDING)
                   ↓
Admin sees in /admin/requests
                   ↓
Admin clicks Approve
                   ↓
Audioseerr → Lidarr API:
  1. POST /api/v1/artist  (add artist if not in library)
  2. POST /api/v1/album   (monitor specific album)
  3. POST /api/v1/command (trigger AlbumSearch)
                   ↓
Status → DOWNLOADING (background poll detects)
                   ↓
Lidarr reports hasFile: true → status → AVAILABLE
```

### Lidarr quirks handled

- Artist-centric model — "request album" transparently adds the artist if needed, with monitoring set to the specific album.
- Quality profile / metadata profile / root folder all required when adding an artist; admin sets defaults during setup.
- Idempotency — if the artist already exists in Lidarr, update existing instead of erroring.

### Failure handling

- Lidarr unreachable on approve → request stays APPROVED, retry with backoff, surfaced in admin UI as "Lidarr connection problem".
- MBID not found in Lidarr's metadata → request marked FAILED with explanation.

### Status sync

Background job every 2 minutes for requests in APPROVED/DOWNLOADING. Uses Lidarr `hasFile` field to detect completion. No webhook required from Lidarr → Audioseerr (more resilient for self-hosters with weird network setups).

### Notifications

- **In-app only in v1:** bell icon with unread count for "request approved", "request downloaded", "request declined".
- **Optional global webhook URL** in settings — fires JSON payload on any request status change. Lets users wire up Discord / ntfy / Gotify themselves without us building integrations for each.

## 9. Auth & user management

### Stack

Auth.js (NextAuth v5) with credentials provider for v1. JWT cookies, 30-day rolling sessions. Bcrypt for password hashing.

### First-run setup wizard

1. Create first admin account (email, username, password)
2. Lidarr connection (URL, API key, test button, pick default quality profile + root folder)
3. Last.fm API key (optional but explained — unlocks discovery)
4. Choose registration mode (default: CLOSED)
5. Mark `setupComplete = true`; wizard becomes inaccessible

### Registration modes

- **CLOSED** (default): admin creates accounts manually or via single-use invite links
- **OPEN**: anyone can sign up, accounts default to `requestQuota = 5`, first N requests require approval
- **OAUTH_ONLY** (v1.5+): accounts auto-created via Plex/Jellyfin login

### Admin UI (`/admin/users`)

- List with role, request count, last login
- Promote / demote, change quota, reset password, delete
- Generate invite link (signed token, single-use, 7-day expiry)

### Per-user UI

- `/account` — change password, email, view own request stats
- "My Requests" with status filters
- Notification bell with unread count

### Explicitly NOT in v1

- 2FA (Auth.js can add later)
- Password reset emails (requires SMTP setup; users can ask admin)
- SSO beyond Plex/Jellyfin

## 10. Background jobs, caching & rate-limit hygiene

### Job runner

`node-cron` invoked from Next.js `instrumentation.ts` hook. In-process. No separate worker container.

### Scheduled jobs

| Job | Cadence | Purpose |
|---|---|---|
| `syncLidarrLibrary` | every 15 min | Pull all artists+albums from Lidarr → upsert `LibraryItem` |
| `syncActiveRequests` | every 2 min | For APPROVED/DOWNLOADING requests, check Lidarr `hasFile` |
| `refreshCharts` | hourly | Pre-warm cache for home-page rows |
| `pruneCache` | daily 4am | Delete expired `ApiCache` rows |
| `pruneOldRequests` | weekly | Archive declined/failed requests >90 days old |

### Caching layers

1. **In-memory LRU** (per-process, 200 entries, 5 min TTL) — for the same lookup hit by multiple users in close succession
2. **`ApiCache` table** — persisted across restarts. TTLs: charts 1h, artist metadata 1d, album metadata 7d, similar-to 1d
3. **Live API call** — last resort

### Rate-limit hygiene

- **MusicBrainz** — strict 1 req/sec, requires `User-Agent: Audioseerr/x.y.z (contact)`. Enforced client-side via token bucket queue.
- **Last.fm** — 5 req/sec; cache aggressively because chart endpoints rarely change
- **Deezer** — generous, but cache art URLs (they're stable)

### Failure modes

- External API down → serve stale cache + log. UI banner only if cache >24h old.
- Lidarr down → request UI keeps working (PENDING queue accumulates), admin approve action shows error and request stays APPROVED until Lidarr reachable.

## 11. Deployment & distribution

### Docker image

- Multi-stage build (Node + Prisma compile → minimal runtime base)
- Multi-arch: `linux/amd64`, `linux/arm64`
- Published to **GitHub Container Registry** (`ghcr.io/<owner>/audioseerr`)
- Tags: `latest`, `1`, `1.2`, `1.2.3` (semver)
- Non-root user, PUID/PGID env support (LinuxServer.io convention)

### Reference `docker-compose.yml`

```yaml
services:
  audioseerr:
    image: ghcr.io/<owner>/audioseerr:latest
    container_name: audioseerr
    environment:
      - SOUNDSEERR_SECRET=changeme
      - PUID=1000
      - PGID=1000
      - TZ=Europe/London
    volumes:
      - ./config:/config
    ports:
      - 5055:5055
    restart: unless-stopped
```

### Reverse proxy ready

- Next.js `basePath` support (e.g., serve at `/audioseerr`)
- Trusts `X-Forwarded-*` headers
- No hard-coded URLs

### Health check

`GET /api/health` returns `{status, lidarr: "connected"|"error", db: "ok"}` for Docker `HEALTHCHECK` and uptime monitors.

### CI/CD (GitHub Actions)

- PR: lint + typecheck + tests
- `main` push: build multi-arch image → push as `latest` + commit-sha tag
- Git tag `v*`: build + push semver tags + auto-generate release notes

### Discoverability launch list

- Submit to `awesome-selfhosted`
- Post on `r/selfhosted`, `r/homelab`, `r/Lidarr`
- Listing in LinuxServer.io fleet (longer-term, after stable release)

## 12. V1 scope, cuts & roadmap

### V1 ships with

- Setup wizard with Lidarr/Last.fm config
- Auth: credentials, admin-managed users, invite links, 3 registration modes
- Discovery: home (charts/trending/genres), search, artist/album/genre pages with 30s previews
- Request flow with admin approval queue + per-user history
- "In library" awareness across all browse surfaces
- In-app notifications + optional global webhook
- Single-container Docker, multi-arch, docker-compose reference

### Explicitly cut from v1

- Personalized recommendations → **v2**
- Plex/Jellyfin OAuth → **v1.5**
- Email/SMTP, 2FA, password reset emails → maybe never
- Multiple Lidarr instances → **v2**
- Built-in playback / streaming → **v3 maybe** (Navidrome already exists)
- i18n → **v2**
- ListenBrainz scrobbling → **v2**
- Mobile native apps → never (PWA-friendly responsive web is enough)
- Sonarr/Radarr integration → never (scope discipline)

### Roadmap

- **v1.0** — everything above. Realistic timeline: 2-4 months solo with AI assistance.
- **v1.5** — Plex/Jellyfin OAuth, ListenBrainz import, reverse-proxy / base-path improvements based on early community feedback
- **v2.0** — algorithmic recs from request history + ListenBrainz "loved tracks", watchlist/saved items, multi-Lidarr, i18n
- **v3.0** — *if community demands it:* playback by talking to Navidrome/Subsonic API

## 13. Open questions

- **Project name** — "Audioseerr" is the working name based on the existing folder; final call before any public registration / domain / repo creation.
- **Hosting org for the GitHub repo** — personal account vs. dedicated org (org is better long-term for handoff).
- **License** — MIT vs Apache 2.0 vs GPLv3. Jellyseerr is MIT. Recommend MIT for max community adoption.
- **Domain** — optional, but a dedicated `audioseerr.dev` or similar makes the project look more credible. Cheap to register.

## 14. Implementation kickoff (next conversation)

Suggested first milestones once we start coding:

1. Scaffold Next.js + TypeScript + Tailwind + shadcn/ui + Prisma + Auth.js
2. Database schema + first migration
3. Setup wizard happy path + first admin account
4. Lidarr connection test in setup
5. Search page + MusicBrainz integration (slimmest possible — just album search)
6. Album detail page with Deezer preview playback
7. Request flow end-to-end (request → admin approve → Lidarr POST)
8. Background sync job for request status
9. Discovery home page (charts via Last.fm)
10. Library snapshot + "in library" badges

Each milestone should be its own PR-shaped chunk so the codebase is reviewable in pieces.
