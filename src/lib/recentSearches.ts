import { prisma } from "@/lib/db";

export type RecentSearch = {
  query: string;
  lastSearchedAt: Date;
};

export async function recordSearch(userId: string, query: string): Promise<void> {
  const trimmed = query.trim();
  if (!trimmed) return;
  await prisma.recentSearch.upsert({
    where: { userId_query: { userId, query: trimmed } },
    create: { userId, query: trimmed },
    update: { lastSearchedAt: new Date() },
  });
}

export async function getRecentSearches(
  userId: string,
  limit = 10,
): Promise<RecentSearch[]> {
  const rows = await prisma.recentSearch.findMany({
    where: { userId },
    orderBy: { lastSearchedAt: "desc" },
    take: limit,
    select: { query: true, lastSearchedAt: true },
  });
  return rows;
}

export async function deleteRecentSearch(userId: string, query: string): Promise<void> {
  await prisma.recentSearch.deleteMany({ where: { userId, query } });
}

export async function clearRecentSearches(userId: string): Promise<void> {
  await prisma.recentSearch.deleteMany({ where: { userId } });
}
