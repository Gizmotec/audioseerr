// Last.fm client. Charts and tag browsing for the discovery surface
// (design doc §4 / §10). Aggressively cached — chart endpoints rarely change.

import { withCache } from "@/lib/cache";

const LASTFM_BASE = "https://ws.audioscrobbler.com/2.0/";

export type LastFmAlbum = {
  /** MB release-group ID, when Last.fm has it. Often empty for newer releases. */
  mbid: string | null;
  title: string;
  artistName: string;
  artistMbid: string | null;
  /** URL to coverartarchive when we can derive one; null otherwise. */
  coverUrl: string | null;
};

type LastFmConfig = { apiKey: string };

async function lastFmFetch<T>(
  config: LastFmConfig,
  params: Record<string, string>,
): Promise<T> {
  const qs = new URLSearchParams({
    ...params,
    api_key: config.apiKey,
    format: "json",
  }).toString();
  const res = await fetch(`${LASTFM_BASE}?${qs}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Last.fm ${params.method} → HTTP ${res.status}`);
  const json = (await res.json()) as T & { error?: number; message?: string };
  if (typeof json.error === "number") {
    throw new Error(`Last.fm error ${json.error}: ${json.message ?? "unknown"}`);
  }
  return json;
}

type LastFmImage = { "#text"?: string; size?: string };

type LastFmTagAlbumsResponse = {
  albums?: {
    album?: Array<{
      name: string;
      mbid?: string;
      artist?: { name?: string; mbid?: string };
      image?: LastFmImage[];
    }>;
  };
};

// Last.fm serves this hash as a "no cover available" placeholder. Skip it.
const LASTFM_PLACEHOLDER_HASH = "2a96cbd8b46e442fc41c2b86b821562f";

function pickLastFmImage(images: LastFmImage[] | undefined): string | null {
  if (!images) return null;
  const sizeOrder = ["extralarge", "large", "medium", "small"];
  for (const size of sizeOrder) {
    const found = images.find((i) => i.size === size && i["#text"]);
    const url = found?.["#text"];
    if (url && !url.includes(LASTFM_PLACEHOLDER_HASH)) return url;
  }
  return null;
}

function pickCoverUrl(
  images: LastFmImage[] | undefined,
  mbid: string | null,
): string | null {
  // Prefer Last.fm's own images — they're already correctly sized and don't
  // require a follow-up redirect chain. Fall back to Cover Art Archive via MBID.
  return (
    pickLastFmImage(images) ??
    (mbid ? `https://coverartarchive.org/release-group/${mbid}/front-250` : null)
  );
}

export async function getTopAlbumsByTag(
  config: LastFmConfig,
  tag: string,
  limit = 12,
): Promise<LastFmAlbum[]> {
  const cacheKey = `lastfm:tag.gettopalbums:${tag.toLowerCase()}:${limit}`;
  return withCache<LastFmAlbum[]>(cacheKey, 60 * 60, async () => {
    const data = await lastFmFetch<LastFmTagAlbumsResponse>(config, {
      method: "tag.gettopalbums",
      tag,
      limit: String(limit),
    });
    return (data.albums?.album ?? [])
      .map((a) => {
        const mbid = a.mbid && a.mbid.length > 0 ? a.mbid : null;
        return {
          mbid,
          title: a.name,
          artistName: a.artist?.name ?? "Unknown artist",
          artistMbid:
            a.artist?.mbid && a.artist.mbid.length > 0 ? a.artist.mbid : null,
          coverUrl: pickCoverUrl(a.image, mbid),
        };
      })
      .filter((a) => a.title.length > 0);
  });
}

type LastFmTopTagsResponse = {
  toptags?: {
    tag?: Array<{
      name: string;
      count?: number;
      reach?: number;
    }>;
  };
};

export type LastFmTag = {
  name: string;
  reach: number;
};

export async function getTopTags(
  config: LastFmConfig,
  limit = 25,
): Promise<LastFmTag[]> {
  const cacheKey = `lastfm:chart.gettoptags:${limit}`;
  return withCache<LastFmTag[]>(cacheKey, 24 * 60 * 60, async () => {
    const data = await lastFmFetch<LastFmTopTagsResponse>(config, {
      method: "chart.gettoptags",
      limit: String(limit),
    });
    return (data.toptags?.tag ?? []).map((t) => ({
      name: t.name,
      reach: typeof t.reach === "number" ? t.reach : 0,
    }));
  });
}
