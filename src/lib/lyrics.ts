// LRClib client (https://lrclib.net). Free lyrics API — no key required; they
// ask only for an identifying User-Agent (same string MusicBrainz gets).
// A 404 ("track not found") is a normal result, not an error: it returns null
// and is cached briefly so the catalogue can fill in. 5xx/network failures
// throw so the UI can offer a retry. Results cached in ApiCache — lyrics are
// stable, so hits live long while misses expire quickly (design doc §10).

import { getCached, setCached } from "@/lib/cache";
import { makeRateLimiter } from "@/lib/rate-limit";

const LRCLIB_BASE = "https://lrclib.net";
const USER_AGENT = "Audioseerr/0.1.0 ( https://github.com/audioseerr )";

// LRClib documents no hard limit; stay polite without stalling user clicks.
const limiter = makeRateLimiter(2);

const HIT_TTL_S = 30 * 24 * 60 * 60; // lyrics for a released track don't change
const MISS_TTL_S = 6 * 60 * 60; // catalogue grows — re-check misses sooner

export type LyricsResult = {
  syncedLyrics: string | null;
  plainLyrics: string | null;
  instrumental: boolean;
};

/** Subset of LRClib's GET /api/get payload we care about. */
export type LrcLibGetResponse = {
  instrumental?: boolean;
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
};

/**
 * Map a raw LRClib payload to our shape. Blank/whitespace-only lyric fields
 * count as absent (LRClib occasionally returns empty strings), and
 * `instrumental` defaults to false when the field is missing.
 */
export function mapLrcLibResponse(data: LrcLibGetResponse): LyricsResult {
  return {
    syncedLyrics:
      typeof data.syncedLyrics === "string" && data.syncedLyrics.trim()
        ? data.syncedLyrics
        : null,
    plainLyrics:
      typeof data.plainLyrics === "string" && data.plainLyrics.trim()
        ? data.plainLyrics
        : null,
    instrumental: data.instrumental === true,
  };
}

// Cache entry wraps the result so a cached MISS is distinguishable from no
// cache row at all (getCached returns null for both otherwise). getCached /
// setCached are used directly instead of withCache because hit and miss need
// different TTLs.
type CacheEntry = { found: true; data: LyricsResult } | { found: false };

function cacheKeyPart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\|/g, " ") // keep the | separators unambiguous
    .replace(/\s+/g, " ");
}

/**
 * Fetch lyrics for a track. Returns null when LRClib has no entry (404).
 * Throws on HTTP 5xx or network failure — the caller (server action) turns
 * that into a retry-able error state.
 */
export async function getLyrics({
  artist,
  title,
  album,
  durationS,
}: {
  artist: string;
  title: string;
  album?: string;
  /** Track duration in seconds — improves LRClib's match when supplied. */
  durationS?: number;
}): Promise<LyricsResult | null> {
  const cacheKey = `lrclib:v1:${cacheKeyPart(artist)}|${cacheKeyPart(title)}|${cacheKeyPart(album ?? "")}|${durationS ?? ""}`;
  const hit = await getCached<CacheEntry>(cacheKey);
  if (hit) return hit.found ? hit.data : null;

  const params = new URLSearchParams({
    artist_name: artist,
    track_name: title,
  });
  if (album) params.set("album_name", album);
  if (durationS != null && Number.isFinite(durationS) && durationS > 0) {
    params.set("duration", String(Math.round(durationS)));
  }

  await limiter.wait();
  const res = await fetch(`${LRCLIB_BASE}/api/get?${params.toString()}`, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });

  if (res.status === 404) {
    await setCached(cacheKey, { found: false } satisfies CacheEntry, MISS_TTL_S);
    return null;
  }
  if (!res.ok) {
    throw new Error(`LRClib /api/get → HTTP ${res.status}`);
  }

  const data = mapLrcLibResponse((await res.json()) as LrcLibGetResponse);
  await setCached(
    cacheKey,
    { found: true, data } satisfies CacheEntry,
    HIT_TTL_S,
  );
  return data;
}
