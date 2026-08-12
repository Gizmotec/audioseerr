import { prisma } from "@/lib/db";
import { MUSIC_LIKE_TYPES, type LikeTargetType } from "@/lib/likes";

export type MostLovedRow = {
  targetType: LikeTargetType;
  targetId: string;
  title: string;
  artistName: string | null;
  albumMbid: string | null;
  albumTitle: string | null;
  coverUrl: string | null;
  count: number;
};

export async function getMostLoved(limit = 12): Promise<MostLovedRow[]> {
  const rows = await prisma.like.findMany({
    // Saved playlists are likes too, but they aren't loved *music*.
    where: { targetType: { in: [...MUSIC_LIKE_TYPES] } },
    orderBy: { createdAt: "desc" },
    select: {
      targetType: true,
      targetId: true,
      title: true,
      artistName: true,
      albumMbid: true,
      albumTitle: true,
      coverUrl: true,
    },
  });

  const grouped = new Map<string, MostLovedRow>();
  for (const row of rows) {
    const key = `${row.targetType}:${row.targetId}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.count += 1;
      continue;
    }
    grouped.set(key, { ...row, count: 1 });
  }

  return [...grouped.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}
