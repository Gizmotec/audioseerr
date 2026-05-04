import { prisma } from "@/lib/db";

export type LikeTargetType = "TRACK" | "ALBUM" | "ARTIST";

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
