// Builds the per-user data export (GDPR-style portability download).
//
// Deliberately prisma-free: the route handler (src/app/account/export/route.ts)
// does the querying and passes plain rows in here. Every output field is
// whitelist-shaped — secrets (passwordHash, Spotify/Last.fm/ListenBrainz
// tokens, API keys, invite data) are never copied through even when present
// on the input objects. Collections are re-sorted here (never mutated in
// place) so the output ordering is deterministic regardless of query order.

import { currentAppVersion } from "@/lib/version";

// ---------- Inputs (structural — Prisma rows satisfy these) ----------

export type ExportProfileInput = {
  username: string;
  email: string;
  role: string;
  createdAt: Date;
  // Additional fields (passwordHash, tokens, …) are tolerated and ignored.
};

export type ExportLikeInput = {
  id: string;
  targetType: string;
  targetId: string;
  title: string;
  artistName: string | null;
  albumMbid: string | null;
  albumTitle: string | null;
  coverUrl: string | null;
  createdAt: Date;
};

export type ExportPlaylistItemInput = {
  id: string;
  position: number;
  recordingMbid: string;
  albumMbid: string;
  albumPosition: number;
  title: string;
  artistName: string;
  albumTitle: string | null;
  coverUrl: string | null;
  durationMs: number | null;
  addedAt: Date;
};

export type ExportPlaylistInput = {
  id: string;
  name: string;
  description: string | null;
  coverUrl: string | null;
  isShared: boolean;
  createdAt: Date;
  updatedAt: Date;
  tracks: ExportPlaylistItemInput[];
};

export type ExportPlayInput = {
  id: string;
  recordingMbid: string;
  albumMbid: string | null;
  artistName: string;
  title: string;
  durationMs: number | null;
  playedMs: number;
  playedAt: Date;
};

export type ExportRequestInput = {
  id: string;
  type: string;
  mbid: string;
  title: string;
  artistName: string;
  coverUrl: string | null;
  albumMbid: string | null;
  albumTitle: string | null;
  recordingMbid: string | null;
  albumPosition: number | null;
  status: string;
  requestedAt: Date;
  approvedAt: Date | null;
  declineReason: string | null;
};

export type ExportLibraryInput = {
  id: string;
  mbid: string;
  addedAt: Date;
  libraryItem: {
    artistName: string;
    title: string;
    status: string;
  } | null;
};

export type ExportCollections = {
  likes: ExportLikeInput[];
  playlists: ExportPlaylistInput[];
  playHistory: ExportPlayInput[];
  requests: ExportRequestInput[];
  library: ExportLibraryInput[];
};

// ---------- Output ----------

export type UserExport = {
  exportedAt: string;
  app: "audioseerr";
  version: string;
  profile: {
    username: string;
    email: string;
    role: string;
    createdAt: string;
  };
  likes: Array<{
    id: string;
    targetType: string;
    targetId: string;
    title: string;
    artistName: string | null;
    albumMbid: string | null;
    albumTitle: string | null;
    coverUrl: string | null;
    createdAt: string;
  }>;
  playlists: Array<{
    id: string;
    name: string;
    description: string | null;
    coverUrl: string | null;
    isShared: boolean;
    createdAt: string;
    updatedAt: string;
    items: Array<{
      id: string;
      position: number;
      recordingMbid: string;
      albumMbid: string;
      albumPosition: number;
      title: string;
      artistName: string;
      albumTitle: string | null;
      coverUrl: string | null;
      durationMs: number | null;
      addedAt: string;
    }>;
  }>;
  playHistory: Array<{
    id: string;
    recordingMbid: string;
    albumMbid: string | null;
    artistName: string;
    title: string;
    durationMs: number | null;
    playedMs: number;
    playedAt: string;
  }>;
  requests: Array<{
    id: string;
    type: string;
    mbid: string;
    title: string;
    artistName: string;
    coverUrl: string | null;
    albumMbid: string | null;
    albumTitle: string | null;
    recordingMbid: string | null;
    albumPosition: number | null;
    status: string;
    requestedAt: string;
    approvedAt: string | null;
    declineReason: string | null;
  }>;
  library: Array<{
    id: string;
    mbid: string;
    artistName: string | null;
    title: string | null;
    status: string | null;
    addedAt: string;
  }>;
};

export function buildExport(
  user: ExportProfileInput,
  collections: ExportCollections,
  options: { now?: Date } = {},
): UserExport {
  const now = options.now ?? new Date();

  return {
    exportedAt: now.toISOString(),
    app: "audioseerr",
    version: currentAppVersion(),
    profile: {
      username: user.username,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
    },
    likes: byDate(collections.likes, (l) => l.createdAt).map((like) => ({
      id: like.id,
      targetType: like.targetType,
      targetId: like.targetId,
      title: like.title,
      artistName: like.artistName,
      albumMbid: like.albumMbid,
      albumTitle: like.albumTitle,
      coverUrl: like.coverUrl,
      createdAt: like.createdAt.toISOString(),
    })),
    playlists: byDate(collections.playlists, (p) => p.createdAt).map(
      (playlist) => ({
        id: playlist.id,
        name: playlist.name,
        description: playlist.description,
        coverUrl: playlist.coverUrl,
        isShared: playlist.isShared,
        createdAt: playlist.createdAt.toISOString(),
        updatedAt: playlist.updatedAt.toISOString(),
        items: [...playlist.tracks]
          .sort((a, b) => a.position - b.position)
          .map((track) => ({
            id: track.id,
            position: track.position,
            recordingMbid: track.recordingMbid,
            albumMbid: track.albumMbid,
            albumPosition: track.albumPosition,
            title: track.title,
            artistName: track.artistName,
            albumTitle: track.albumTitle,
            coverUrl: track.coverUrl,
            durationMs: track.durationMs,
            addedAt: track.addedAt.toISOString(),
          })),
      }),
    ),
    playHistory: byDate(collections.playHistory, (p) => p.playedAt).map(
      (play) => ({
        id: play.id,
        recordingMbid: play.recordingMbid,
        albumMbid: play.albumMbid,
        artistName: play.artistName,
        title: play.title,
        durationMs: play.durationMs,
        playedMs: play.playedMs,
        playedAt: play.playedAt.toISOString(),
      }),
    ),
    requests: byDate(collections.requests, (r) => r.requestedAt).map(
      (request) => ({
        id: request.id,
        type: request.type,
        mbid: request.mbid,
        title: request.title,
        artistName: request.artistName,
        coverUrl: request.coverUrl,
        albumMbid: request.albumMbid,
        albumTitle: request.albumTitle,
        recordingMbid: request.recordingMbid,
        albumPosition: request.albumPosition,
        status: request.status,
        requestedAt: request.requestedAt.toISOString(),
        approvedAt: request.approvedAt?.toISOString() ?? null,
        declineReason: request.declineReason,
      }),
    ),
    library: byDate(collections.library, (l) => l.addedAt).map((item) => ({
      id: item.id,
      mbid: item.mbid,
      artistName: item.libraryItem?.artistName ?? null,
      title: item.libraryItem?.title ?? null,
      status: item.libraryItem?.status ?? null,
      addedAt: item.addedAt.toISOString(),
    })),
  };
}

// audioseerr-export-<username>-<YYYYMMDD>.json — username sanitized so the
// Content-Disposition header stays safe for any characters a username allows.
export function exportFileName(username: string, date: Date): string {
  const safe = username.replace(/[^A-Za-z0-9_.-]/g, "_") || "user";
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `audioseerr-export-${safe}-${y}${m}${d}.json`;
}

// Sort a copy by date asc, tie-breaking on id so equal timestamps still
// serialize deterministically.
function byDate<T extends { id: string }>(
  rows: T[],
  dateOf: (row: T) => Date,
): T[] {
  return [...rows].sort((a, b) => {
    const diff = dateOf(a).getTime() - dateOf(b).getTime();
    if (diff !== 0) return diff;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}
