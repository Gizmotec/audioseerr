import { prisma } from "@/lib/db";
import { getAlbum } from "@/lib/musicbrainz";
import type { PlaylistDetail, PlaylistSummary, PlaylistTrackRow } from "@/lib/playlists";

export type LikeTargetType = "TRACK" | "ALBUM" | "ARTIST";

export const LIKED_SONGS_PLAYLIST_ID = "liked";

export type LikePayload = {
  targetType: LikeTargetType;
  targetId: string;
  title: string;
  artistName?: string | null;
  albumMbid?: string | null;
  albumTitle?: string | null;
  coverUrl?: string | null;
};

export async function isLiked(
  userId: string,
  targetType: LikeTargetType,
  targetId: string,
): Promise<boolean> {
  const row = await prisma.like.findUnique({
    where: {
      userId_targetType_targetId: { userId, targetType, targetId },
    },
    select: { id: true },
  });
  return row !== null;
}

/**
 * Batch lookup for rendering lists. Returns a Set of targetIds that the user
 * has liked for the given type — callers do `set.has(id)` per row.
 */
export async function getLikedSet(
  userId: string,
  targetType: LikeTargetType,
  targetIds: string[],
): Promise<Set<string>> {
  if (targetIds.length === 0) return new Set();
  const rows = await prisma.like.findMany({
    where: { userId, targetType, targetId: { in: targetIds } },
    select: { targetId: true },
  });
  return new Set(rows.map((r) => r.targetId));
}

export type LikedRow = {
  id: string;
  targetType: LikeTargetType;
  targetId: string;
  title: string;
  artistName: string | null;
  albumMbid: string | null;
  albumTitle: string | null;
  coverUrl: string | null;
  createdAt: Date;
};

/**
 * All of a user's likes, newest first. Cheap on SQLite at the scales we expect
 * (a single user's library); we fetch them all and bucket in the page.
 */
export async function getAllLikes(userId: string): Promise<LikedRow[]> {
  return prisma.like.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      targetType: true,
      targetId: true,
      title: true,
      artistName: true,
      albumMbid: true,
      albumTitle: true,
      coverUrl: true,
      createdAt: true,
    },
  });
}

function coverUrlForReleaseGroup(mbid: string): string {
  return `https://coverartarchive.org/release-group/${mbid}/front-250`;
}

function likedSongsCoverUrls(rows: LikedRow[]): string[] {
  const coverUrls: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const url =
      row.coverUrl ?? (row.albumMbid ? coverUrlForReleaseGroup(row.albumMbid) : null);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    coverUrls.push(url);
    if (coverUrls.length === 4) break;
  }
  return coverUrls;
}

export async function getLikedSongsPlaylistSummary(
  userId: string,
): Promise<PlaylistSummary> {
  const rows = await prisma.like.findMany({
    where: { userId, targetType: "TRACK" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      targetType: true,
      targetId: true,
      title: true,
      artistName: true,
      albumMbid: true,
      albumTitle: true,
      coverUrl: true,
      createdAt: true,
    },
    take: 24,
  });
  const coverUrls = likedSongsCoverUrls(rows);
  const trackCount = await prisma.like.count({
    where: { userId, targetType: "TRACK" },
  });

  return {
    id: LIKED_SONGS_PLAYLIST_ID,
    name: "Liked Songs",
    description: "Tracks you've hearted across Audioseerr.",
    trackCount,
    coverUrls,
    coverUrl: coverUrls[0] ?? null,
    updatedAt: rows[0]?.createdAt ?? new Date(0),
    system: "liked-songs",
  };
}

export async function getLikedSongsPlaylist(
  userId: string,
): Promise<PlaylistDetail> {
  const rows = await prisma.like.findMany({
    where: { userId, targetType: "TRACK" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      targetType: true,
      targetId: true,
      title: true,
      artistName: true,
      albumMbid: true,
      albumTitle: true,
      coverUrl: true,
      createdAt: true,
    },
  });
  const coverUrls = likedSongsCoverUrls(rows);
  const albums = new Map<string, Awaited<ReturnType<typeof getAlbum>>>();
  await Promise.all(
    Array.from(new Set(rows.map((row) => row.albumMbid).filter(Boolean))).map(
      async (albumMbid) => {
        albums.set(albumMbid!, await getAlbum(albumMbid!));
      },
    ),
  );

  const tracks = rows.flatMap<PlaylistTrackRow>((row, index) => {
    if (!row.albumMbid) return [];
    const album = albums.get(row.albumMbid);
    const mbTrack =
      album?.tracks.find((track) => track.recordingMbid === row.targetId) ??
      album?.tracks.find(
        (track) => track.title.toLowerCase() === row.title.toLowerCase(),
      );
    if (!mbTrack) return [];

    return [
      {
        id: row.id,
        position: index + 1,
        recordingMbid: row.targetId,
        trackFileId: 0,
        albumMbid: row.albumMbid,
        albumPosition: mbTrack.absolutePosition,
        title: row.title,
        artistName: row.artistName ?? album?.artistName ?? "Unknown artist",
        albumTitle: row.albumTitle ?? album?.title ?? null,
        coverUrl: row.coverUrl ?? coverUrlForReleaseGroup(row.albumMbid),
        durationMs: mbTrack.lengthMs,
      },
    ];
  });

  return {
    id: LIKED_SONGS_PLAYLIST_ID,
    name: "Liked Songs",
    description: "Tracks you've hearted across Audioseerr.",
    coverUrl: coverUrls[0] ?? null,
    createdAt: rows.at(-1)?.createdAt ?? new Date(0),
    updatedAt: rows[0]?.createdAt ?? new Date(0),
    tracks,
    system: "liked-songs",
  };
}

/**
 * Toggle a like for the given user+target. Returns the new state. The payload
 * metadata is only persisted on insert — re-liking a row later won't refresh
 * stale title/cover values, which is fine for v1.
 */
export async function toggleLike(
  userId: string,
  payload: LikePayload,
): Promise<{ liked: boolean }> {
  const { targetType, targetId } = payload;
  const existing = await prisma.like.findUnique({
    where: { userId_targetType_targetId: { userId, targetType, targetId } },
    select: { id: true },
  });
  if (existing) {
    await prisma.like.delete({ where: { id: existing.id } });
    return { liked: false };
  }
  await prisma.like.create({
    data: {
      userId,
      targetType,
      targetId,
      title: payload.title,
      artistName: payload.artistName ?? null,
      albumMbid: payload.albumMbid ?? null,
      albumTitle: payload.albumTitle ?? null,
      coverUrl: payload.coverUrl ?? null,
    },
  });
  return { liked: true };
}
