// Resolve an artist or album to its Apple Music page URL via the public iTunes
// Search API (no key, ~20 req/min/IP). One-click direct link beats dumping the
// user on a search page; we cache hits for 30 days because Apple Music URLs are
// permanent once published, but skip caching misses so a transient network blip
// doesn't poison the result for a month.

import { getCached, setCached } from "@/lib/cache";

const ITUNES_SEARCH = "https://itunes.apple.com/search";
const CACHE_TTL_SECONDS = 30 * 24 * 60 * 60;

type ITunesEntity = "album" | "musicArtist";

type ITunesSearchResponse = {
  resultCount?: number;
  results?: Array<{
    // `entity=album` returns a collection wrapper with `collectionViewUrl`.
    collectionViewUrl?: string;
    // `entity=musicArtist` returns an artist wrapper with `artistLinkUrl`
    // (NOT `artistViewUrl` — that field only appears alongside album results).
    artistLinkUrl?: string;
  }>;
};

function searchFallbackUrl(term: string): string {
  return `https://music.apple.com/search?term=${encodeURIComponent(term)}`;
}

export async function resolveAppleMusicUrl({
  artistName,
  albumTitle,
}: {
  artistName: string;
  albumTitle?: string;
}): Promise<string> {
  const term = albumTitle ? `${artistName} ${albumTitle}` : artistName;
  const entity: ITunesEntity = albumTitle ? "album" : "musicArtist";
  const fallback = searchFallbackUrl(term);

  const cacheKey = `appleMusic:${entity}:${term.toLowerCase()}`;
  const cached = await getCached<string>(cacheKey);
  if (cached) return cached;

  const params = new URLSearchParams({
    term,
    entity,
    limit: "1",
    media: "music",
  });
  let res: Response;
  try {
    res = await fetch(`${ITUNES_SEARCH}?${params.toString()}`, {
      headers: { Accept: "application/json" },
    });
  } catch {
    return fallback;
  }
  if (!res.ok) return fallback;

  let data: ITunesSearchResponse;
  try {
    data = (await res.json()) as ITunesSearchResponse;
  } catch {
    return fallback;
  }

  const hit = data.results?.[0];
  const direct = albumTitle ? hit?.collectionViewUrl : hit?.artistLinkUrl;
  if (!direct) return fallback;

  await setCached(cacheKey, direct, CACHE_TTL_SECONDS);
  return direct;
}
