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

// In-flight work, keyed the same way as the persistent cache. Without this, N
// concurrent misses for one key each run `fn` — N MusicBrainz calls through a
// 1-req/sec limiter, so the last caller waits N seconds and MusicBrainz is that
// much more likely to answer 503. One page render can easily fan out that way
// (an album grid, a mix, and a search all wanting the same artist).
const inFlight = new Map<string, Promise<unknown>>();

export async function withCache<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>,
): Promise<T> {
  const hit = await getCached<T>(key);
  if (hit !== null) return hit;

  const pending = inFlight.get(key);
  if (pending) return pending as Promise<T>;

  const work = (async () => {
    const fresh = await fn();
    // A null result reads back as a miss (getCached can't tell "cached null"
    // from "absent"), so writing one only costs a row. Skip it.
    if (fresh !== null && fresh !== undefined) {
      await setCached(key, fresh, ttlSeconds);
    }
    return fresh;
  })();

  inFlight.set(key, work);
  try {
    return await work;
  } finally {
    inFlight.delete(key);
  }
}
