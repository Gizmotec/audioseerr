import { prisma } from "@/lib/db";

// Persistent cache backed by the ApiCache table (design doc §10). TTLs are
// chosen at call-site — charts 1h, artist metadata 1d, album metadata 7d, etc.
// An in-memory LRU layer can sit on top of this in a later PR if hot keys
// become a bottleneck.

export async function getCached<T>(key: string): Promise<T | null> {
  const row = await prisma.apiCache.findUnique({ where: { key } });
  if (!row) return null;
  if (row.expiresAt.getTime() < Date.now()) {
    await prisma.apiCache.delete({ where: { key } }).catch(() => {});
    return null;
  }
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return null;
  }
}

export async function setCached(
  key: string,
  value: unknown,
  ttlSeconds: number,
): Promise<void> {
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
  const serialized = JSON.stringify(value);
  await prisma.apiCache.upsert({
    where: { key },
    create: { key, value: serialized, expiresAt },
    update: { value: serialized, expiresAt },
  });
}

export async function withCache<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>,
): Promise<T> {
  const hit = await getCached<T>(key);
  if (hit !== null) return hit;
  const fresh = await fn();
  await setCached(key, fresh, ttlSeconds);
  return fresh;
}
