import { prisma } from "@/lib/db";
import { trackLikeTargetId } from "@/lib/likeKeys";
import { getAlbum } from "@/lib/musicbrainz";
import type { PlaylistSummary } from "@/lib/playlists";

// Re-exported so existing server-side callers can keep importing it from here.
// The definition lives in the client-safe likeKeys module (no Prisma import) so
// client components can use it without dragging better-sqlite3 into the bundle.
export { trackLikeTargetId } from "@/lib/likeKeys";

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

export async function getLikedInboxSummary(
  userId: string,
): Promise<PlaylistSummary> {
  const unsorted = await getUnsortedTrackLikes(userId);
  const coverUrls = likedSongsCoverUrls(unsorted.slice(0, 24));

  return {
    id: LIKED_SONGS_PLAYLIST_ID,
    name: "Liked Songs",
    description: "Hearted tracks waiting to be sorted into a playlist.",
    trackCount: unsorted.length,
    coverUrls,
    coverUrl: coverUrls[0] ?? null,
    updatedAt: unsorted[0]?.createdAt ?? new Date(0),
    isShared: false,
    isOwner: true,
    ownerUsername: null,
    system: "liked-songs",
  };
}

/**
 * Like-keys (see trackLikeTargetId) of every track in the user's own
 * playlists. A liked track matching this set is "sorted" and leaves the
 * liked-songs inbox. System playlists have no owner, so the `userId` match
 * already restricts this to the user's curated playlists.
 */
async function getSortedLikedTargetIds(userId: string): Promise<Set<string>> {
  const rows = await prisma.playlistTrack.findMany({
    where: { playlist: { userId } },
    select: { recordingMbid: true, albumMbid: true, albumPosition: true },
  });
  const out = new Set<string>();
  for (const row of rows) {
    const key = trackLikeTargetId(row.recordingMbid, row.albumMbid, row.albumPosition);
    if (key) out.add(key);
  }
  return out;
}

/**
 * The user's TRACK likes that aren't in any of their playlists yet — the
 * inbox contents, newest first. Likes without an albumMbid can't be
 * positioned or streamed, so they're dropped here (same as the old
 * liked-songs view did at render time).
 */
async function getUnsortedTrackLikes(userId: string): Promise<LikedRow[]> {
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
  if (rows.length === 0) return rows;
  const sorted = await getSortedLikedTargetIds(userId);
  return rows.filter((row) => row.albumMbid && !sorted.has(row.targetId));
}

export type UnsortedLikedTrack = {
  /** Like row id — stable React key and removal handle. */
  id: string;
  /** The like key (recording MBID or `albumMbid:position` synthetic id). */
  targetId: string;
  albumMbid: string;
  albumPosition: number;
  title: string;
  artistName: string;
  albumTitle: string | null;
  coverUrl: string | null;
  durationMs: number | null;
};

/**
 * Inbox tracks resolved against MusicBrainz for album position and duration
 * (needed for stream lookup and display). Album metadata is fetched once per
 * distinct album and served from the ApiCache on repeat renders.
 */
export async function getUnsortedLikedTracks(
  userId: string,
): Promise<UnsortedLikedTrack[]> {
  const rows = await getUnsortedTrackLikes(userId);
  const albums = new Map<string, Awaited<ReturnType<typeof getAlbum>>>();
  await Promise.all(
    Array.from(new Set(rows.map((row) => row.albumMbid!))).map(
      async (albumMbid) => {
        albums.set(albumMbid, await getAlbum(albumMbid));
      },
    ),
  );

  return rows.flatMap<UnsortedLikedTrack>((row) => {
    const album = albums.get(row.albumMbid!);
    const mbTrack =
      album?.tracks.find((track) => track.recordingMbid === row.targetId) ??
      album?.tracks.find(
        (track) => track.title.toLowerCase() === row.title.toLowerCase(),
      );
    if (!mbTrack) return [];

    return [
      {
        id: row.id,
        targetId: row.targetId,
        albumMbid: row.albumMbid!,
        albumPosition: mbTrack.absolutePosition,
        title: row.title,
        artistName: row.artistName ?? album?.artistName ?? "Unknown artist",
        albumTitle: row.albumTitle ?? album?.title ?? null,
        coverUrl: row.coverUrl ?? coverUrlForReleaseGroup(row.albumMbid!),
        durationMs: mbTrack.lengthMs,
      },
    ];
  });
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
