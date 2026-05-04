import { prisma } from "@/lib/db";

/**
 * Daily sweep of expired ApiCache rows (design doc §10). `getCached` already
 * deletes lazily on read, but unread keys can accumulate forever — this keeps
 * the table from growing without bound on long-running instances.
 */
export async function pruneCache(): Promise<{ deleted: number }> {
  const result = await prisma.apiCache.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return { deleted: result.count };
}
