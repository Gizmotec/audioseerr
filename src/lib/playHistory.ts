import { prisma } from "@/lib/db";
import type { LibraryTileItem } from "@/app/library/LibraryAlbumTile";
import type { LibraryStatus } from "@/lib/library";
import {
  isAdmin,
  libraryWhereForViewer,
  type LibraryViewer,
} from "@/lib/userLibrary";

// Last.fm-style scrobble threshold. A "play" is recorded once playback crosses
// 50% of the track OR 4 minutes, whichever happens first. Tracks shorter than
// 30 seconds never count. The client enforces the threshold; this helper just
// validates and writes.
export const SCROBBLE_MIN_DURATION_MS = 30_000;
export const SCROBBLE_MAX_THRESHOLD_MS = 4 * 60 * 1000;

export type RecordPlayInput = {
  recordingMbid: string;
  albumMbid?: string | null;
  artistName: string;
  title: string;
  durationMs?: number | null;
  playedMs: number;
};

export async function recordPlay(
  userId: string,
  input: RecordPlayInput,
): Promise<void> {
  if (!input.recordingMbid || !input.artistName || !input.title) return;
  if (input.playedMs <= 0) return;

  await prisma.playHistory.create({
    data: {
      userId,
      recordingMbid: input.recordingMbid,
      albumMbid: input.albumMbid ?? null,
      artistName: input.artistName,
      title: input.title,
      durationMs: input.durationMs ?? null,
      playedMs: Math.round(input.playedMs),
    },
  });
}

export type PlayedAlbumItem = LibraryTileItem & {
  lastPlayedAt: Date;
  playCount: number;
};

/**
 * Joins PlayHistory aggregates against LibraryItem so we can render the
 * existing tile component. Albums no longer in the viewer's library (removed
 * after being played, or never in their slice) are filtered out — there's
 * nothing to navigate to.
 */
async function joinPlayedAlbumsWithLibrary(
  rows: { albumMbid: string; lastPlayedAt: Date; playCount: number }[],
  viewer: LibraryViewer,
): Promise<PlayedAlbumItem[]> {
  if (rows.length === 0) return [];
  const items = await prisma.libraryItem.findMany({
    where: {
      ...libraryWhereForViewer(viewer),
      mbid: { in: rows.map((r) => r.albumMbid) },
    },
    select: {
      mbid: true,
      status: true,
      artistName: true,
      title: true,
      trackFileCount: true,
      totalTrackCount: true,
    },
  });
  const byMbid = new Map(items.map((it) => [it.mbid, it]));
  return rows.flatMap((row) => {
    const item = byMbid.get(row.albumMbid);
    if (!item) return [];
    return [
      {
        mbid: item.mbid,
        title: item.title,
        artistName: item.artistName,
        status: item.status as LibraryStatus,
        trackFileCount: item.trackFileCount,
        totalTrackCount: item.totalTrackCount,
        lastPlayedAt: row.lastPlayedAt,
        playCount: row.playCount,
      },
    ];
  });
}

export async function getRecentlyPlayedAlbums(
  userId: string,
  limit = 12,
  viewer: LibraryViewer = { id: userId },
): Promise<PlayedAlbumItem[]> {
  const groups = await prisma.playHistory.groupBy({
    by: ["albumMbid"],
    where: { userId, albumMbid: { not: null } },
    _max: { playedAt: true },
    _count: { _all: true },
    orderBy: { _max: { playedAt: "desc" } },
    take: limit,
  });
  const rows = groups.flatMap((g) => {
    if (!g.albumMbid || !g._max.playedAt) return [];
    return [
      {
        albumMbid: g.albumMbid,
        lastPlayedAt: g._max.playedAt,
        playCount: g._count._all,
      },
    ];
  });
  return joinPlayedAlbumsWithLibrary(rows, viewer);
}

export async function getMostPlayedAlbums(
  userId: string,
  limit = 12,
  viewer: LibraryViewer = { id: userId },
): Promise<PlayedAlbumItem[]> {
  const groups = await prisma.playHistory.groupBy({
    by: ["albumMbid"],
    where: { userId, albumMbid: { not: null } },
    _max: { playedAt: true },
    _count: { _all: true },
    orderBy: { _count: { albumMbid: "desc" } },
    take: limit,
  });
  const rows = groups.flatMap((g) => {
    if (!g.albumMbid || !g._max.playedAt) return [];
    return [
      {
        albumMbid: g.albumMbid,
        lastPlayedAt: g._max.playedAt,
        playCount: g._count._all,
      },
    ];
  });
  return joinPlayedAlbumsWithLibrary(rows, viewer);
}

// --- Track-level history (the track-first Home) -----------------------------

export type PlayedTrackItem = {
  id: string;
  title: string;
  artistName: string;
  albumTitle: string | null;
  albumMbid: string;
  albumPosition: number;
  coverUrl: string | null;
  durationMs: number | null;
  recordingMbid: string | null;
  lastPlayedAt: Date;
  playCount: number;
};

/**
 * Resolve grouped PlayHistory rows (keyed by recordingMbid) to the viewer's
 * own, playable DownloadedTrack. Plays of tracks the viewer no longer owns drop
 * out — there's nothing to stream. PlayHistory has no album position, so the
 * join key is recordingMbid (always set on a scrobble).
 */
async function joinPlayedTracksWithLibrary(
  rows: { recordingMbid: string; lastPlayedAt: Date; playCount: number }[],
  viewer: LibraryViewer,
): Promise<PlayedTrackItem[]> {
  if (rows.length === 0 || !viewer) return [];
  const tracks = await prisma.downloadedTrack.findMany({
    where: {
      recordingMbid: { in: rows.map((r) => r.recordingMbid) },
      // Don't surface unkept pre-downloaded temp tracks in recently/most played.
      ephemeral: false,
      ...(isAdmin(viewer) ? {} : { users: { some: { userId: viewer.id } } }),
    },
    select: {
      id: true,
      recordingMbid: true,
      title: true,
      artistName: true,
      albumTitle: true,
      albumMbid: true,
      albumPosition: true,
      coverUrl: true,
      durationMs: true,
    },
  });
  const byRecording = new Map(
    tracks.flatMap((t) => (t.recordingMbid ? [[t.recordingMbid, t] as const] : [])),
  );
  return rows.flatMap((row) => {
    const t = byRecording.get(row.recordingMbid);
    if (!t) return [];
    return [
      {
        id: t.id,
        title: t.title,
        artistName: t.artistName,
        albumTitle: t.albumTitle,
        albumMbid: t.albumMbid,
        albumPosition: t.albumPosition,
        coverUrl: t.coverUrl,
        durationMs: t.durationMs,
        recordingMbid: t.recordingMbid,
        lastPlayedAt: row.lastPlayedAt,
        playCount: row.playCount,
      },
    ];
  });
}

export async function getRecentlyPlayedTracks(
  userId: string,
  limit = 12,
  viewer: LibraryViewer = { id: userId },
): Promise<PlayedTrackItem[]> {
  const groups = await prisma.playHistory.groupBy({
    by: ["recordingMbid"],
    where: { userId },
    _max: { playedAt: true },
    _count: { _all: true },
    orderBy: { _max: { playedAt: "desc" } },
    take: limit,
  });
  const rows = groups.flatMap((g) =>
    g._max.playedAt
      ? [
          {
            recordingMbid: g.recordingMbid,
            lastPlayedAt: g._max.playedAt,
            playCount: g._count._all,
          },
        ]
      : [],
  );
  return joinPlayedTracksWithLibrary(rows, viewer);
}

export async function getMostPlayedTracks(
  userId: string,
  limit = 12,
  viewer: LibraryViewer = { id: userId },
): Promise<PlayedTrackItem[]> {
  const groups = await prisma.playHistory.groupBy({
    by: ["recordingMbid"],
    where: { userId },
    _max: { playedAt: true },
    _count: { _all: true },
    orderBy: { _count: { recordingMbid: "desc" } },
    take: limit,
  });
  const rows = groups.flatMap((g) =>
    g._max.playedAt
      ? [
          {
            recordingMbid: g.recordingMbid,
            lastPlayedAt: g._max.playedAt,
            playCount: g._count._all,
          },
        ]
      : [],
  );
  return joinPlayedTracksWithLibrary(rows, viewer);
}
