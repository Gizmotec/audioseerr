# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## Project history

Audioseerr hasn't cut a numbered release yet — here's a user-facing summary of the major milestones from development so far (newest first), grouped by theme. For the full detail, see the commit log.

### Discovery & browsing

- Track-first discovery across Home, Discover, and genre pages, with inline song downloads and per-track "Find Similar" radio
- Discovery charts, artist-aware search with de-noised album ranking, album-art genre cards, and expanded genre coverage
- Loading skeletons for home and album detail pages
- Library home with shuffle playback, library search/filter, and Recently/Most Played surfaces backed by play history

### Downloads (slskd)

- Soulseek downloads via slskd — first single songs, then full albums — replacing the earlier Lidarr/Prowlarr/qBittorrent pipeline, which was dropped in favor of a slskd-only model
- Background track search with peer failover and live download progress
- Requests and queue merged into a single Requests/Downloads page with retry for not-found tracks
- Auto-approval options for playlist subscriptions and discovery-mix pre-downloads

### Playlists & mixes

- Weekly-refreshing editorial playlists with custom covers and subscriptions
- Daily mixes and discovery mixes, with optional pre-download into temporary storage
- Playlist recommendations, mixes/radio, and per-track likes; Liked Songs became a triage inbox at `/liked`
- Spotify playlist import (moved to the playlists page, with redirect-URI warnings on insecure origins)

### Playback

- Full-song previews, with Deezer URLs resolved at play time so previews don't silently expire
- In-app YouTube player for track previews (requires a `YOUTUBE_API_KEY`)
- Player bar volume control, Space to play/pause, and themed scrollbars

### Multi-user & admin

- Multi-user support: invitations, per-user libraries, and playlist sharing, with per-type auto-approve flags
- Tabbed admin settings with search and unified integration cards
- In-app update banner (checks GitHub for new releases)

### Design & platform

- Flat, soft neo-brutalism redesign with a collapsible sidebar, pastel hero cards, and a consistent radius ladder
- Local design-system styleguide page
- Docker self-hosting: single container with auto-generated secrets on first boot, migrations applied on startup, and configurable host port and music-library mount
