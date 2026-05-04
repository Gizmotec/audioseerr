// YouTube Data API v3 client. Single use case: given an artist + track title,
// return a videoId we can drop into a youtube-nocookie.com/embed iframe so the
// user can watch the track in-app. Heavily cached — search costs 100 quota
// units, free tier is 10,000/day, so caching a single hit for 30 days keeps
// this comfortably free for typical use.

import { withCache } from "@/lib/cache";
import { normalizeTrackTitle } from "@/lib/deezer";

const YT_BASE = "https://www.googleapis.com/youtube/v3";

type YouTubeSearchResponse = {
  items?: Array<{
    id?: { videoId?: string };
  }>;
};

/**
 * True when an API key is configured. Callers use this to decide whether the
 * embed flow is available, or whether to fall back to opening a search URL
 * in a new tab.
 */
export function hasYouTubeApiKey(): boolean {
  return !!process.env.YOUTUBE_API_KEY?.trim();
}

/**
 * URL the no-key fallback opens in a new tab. Always usable since it's just
 * a plain youtube.com search.
 */
export function youtubeSearchUrl(artistName: string, trackTitle: string): string {
  const q = `${artistName} ${trackTitle}`.trim();
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
}

/**
 * Resolve "{artist} {title}" to a YouTube videoId. Returns null when:
 *   - no API key is configured
 *   - the query returns no embeddable results
 *   - the API call fails (quota, network, etc.)
 *
 * Cached for 30 days keyed by the normalized artist+title — the same canonical
 * recording lands on the same videoId for a long time.
 */
export async function resolveYouTubeVideoId(
  artistName: string,
  trackTitle: string,
): Promise<string | null> {
  const apiKey = process.env.YOUTUBE_API_KEY?.trim();
  if (!apiKey) return null;

  const a = normalizeTrackTitle(artistName);
  const t = normalizeTrackTitle(trackTitle);
  if (!a || !t) return null;

  const cacheKey = `youtube:videoId:${a}::${t}`;
  return withCache<string | null>(cacheKey, 30 * 24 * 60 * 60, async () => {
    const params = new URLSearchParams({
      part: "snippet",
      q: `${artistName} ${trackTitle}`,
      type: "video",
      videoEmbeddable: "true",
      // Music category — narrows to actual track uploads vs. live clips,
      // reaction videos, lyric-only montages, etc.
      videoCategoryId: "10",
      maxResults: "1",
      key: apiKey,
    });
    let res: Response;
    try {
      res = await fetch(`${YT_BASE}/search?${params.toString()}`, {
        headers: { Accept: "application/json" },
      });
    } catch {
      return null;
    }
    if (!res.ok) return null;
    const data = (await res.json()) as YouTubeSearchResponse;
    const id = data.items?.[0]?.id?.videoId;
    return id && id.length > 0 ? id : null;
  });
}
