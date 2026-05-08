import { prisma } from "@/lib/db";
import type { LibraryTileItem } from "@/app/library/LibraryAlbumTile";
import type { LibraryStatus } from "@/lib/library";

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
 * existing tile component. Albums no longer in the library (e.g. removed
 * after being played) are filtered out — there's nothing to navigate to.
 */
async function joinPlayedAlbumsWithLibrary(
  rows: { albumMbid: string; lastPlayedAt: Date; playCount: number }[],
): Promise<PlayedAlbumItem[]> {
  if (rows.length === 0) return [];
  const items = await prisma.libraryItem.findMany({
    where: { mbid: { in: rows.map((r) => r.albumMbid) } },
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
  return joinPlayedAlbumsWithLibrary(rows);
}

export async function getMostPlayedAlbums(
  userId: string,
  limit = 12,
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
  return joinPlayedAlbumsWithLibrary(rows);
}
