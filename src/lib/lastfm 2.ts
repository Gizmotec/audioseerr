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

export type LastFmConfig = { apiKey: string };

export type LastFmChartTrack = {
  name: string;
  mbid: string | null;
  artistName: string;
  artistMbid: string | null;
  albumTitle: string | null;
  playcount: number;
  listeners: number;
  url: string | null;
  imageUrl: string | null;
};

export type LastFmChartArtist = {
  name: string;
  mbid: string | null;
  playcount: number;
  listeners: number;
  url: string | null;
  imageUrl: string | null;
};

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

function toNumber(value: string | undefined): number {
  return value ? Number(value) || 0 : 0;
}

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

type LastFmChartTracksResponse = {
  tracks?: {
    track?: Array<{
      name?: string;
      mbid?: string;
      playcount?: string;
      listeners?: string;
      url?: string;
      image?: LastFmImage[];
      artist?: { name?: string; mbid?: string };
    }>;
  };
};

export async function getGlobalTopTracks(
  config: LastFmConfig,
  limit = 12,
): Promise<LastFmChartTrack[]> {
  const cacheKey = `lastfm:chart.gettoptracks:${limit}`;
  return withCache<LastFmChartTrack[]>(cacheKey, 60 * 60, async () => {
    const data = await lastFmFetch<LastFmChartTracksResponse>(config, {
      method: "chart.gettoptracks",
      limit: String(limit),
    });
    return (data.tracks?.track ?? [])
      .map((t) => ({
        name: t.name ?? "",
        mbid: t.mbid && t.mbid.length > 0 ? t.mbid : null,
        artistName: t.artist?.name ?? "Unknown artist",
        artistMbid:
          t.artist?.mbid && t.artist.mbid.length > 0 ? t.artist.mbid : null,
        albumTitle: null,
        playcount: toNumber(t.playcount),
        listeners: toNumber(t.listeners),
        url: t.url ?? null,
        imageUrl: pickLastFmImage(t.image),
      }))
      .filter((t) => t.name.length > 0);
  });
}

type LastFmChartArtistsResponse = {
  artists?: {
    artist?: Array<{
      name?: string;
      mbid?: string;
      playcount?: string;
      listeners?: string;
      url?: string;
      image?: LastFmImage[];
    }>;
  };
};

export async function getGlobalTopArtists(
  config: LastFmConfig,
  limit = 12,
): Promise<LastFmChartArtist[]> {
  const cacheKey = `lastfm:chart.gettopartists:${limit}`;
  return withCache<LastFmChartArtist[]>(cacheKey, 60 * 60, async () => {
    const data = await lastFmFetch<LastFmChartArtistsResponse>(config, {
      method: "chart.gettopartists",
      limit: String(limit),
    });
    return (data.artists?.artist ?? [])
      .map((a) => ({
        name: a.name ?? "",
        mbid: a.mbid && a.mbid.length > 0 ? a.mbid : null,
        playcount: toNumber(a.playcount),
        listeners: toNumber(a.listeners),
        url: a.url ?? null,
        imageUrl: pickLastFmImage(a.image),
      }))
      .filter((a) => a.name.length > 0);
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

type LastFmArtistInfoResponse = {
  artist?: {
    name?: string;
    mbid?: string;
    bio?: {
      summary?: string;
      content?: string;
    };
    tags?: { tag?: Array<{ name?: string }> };
    stats?: { listeners?: string; playcount?: string };
  };
};

export type LastFmArtistInfo = {
  /** Plain text, with the trailing "Read more on Last.fm" link stripped. */
  bio: string | null;
  tags: string[];
  listeners: number | null;
};

// Last.fm appends a "<a href...>Read more on Last.fm</a>." link to every bio.
// It's noise for our card; trim it.
function stripBioFooter(html: string): string {
  return html
    .replace(/<a[^>]*>Read more on Last\.fm<\/a>\.?/i, "")
    .replace(/<a[^>]*>(.*?)<\/a>/gi, "$1")
    .trim();
}

export async function getArtistInfo(
  config: LastFmConfig,
  mbid: string | null,
  name: string,
): Promise<LastFmArtistInfo | null> {
  const cacheKey = `lastfm:artist.getinfo:${(mbid ?? name).toLowerCase()}`;
  return withCache<LastFmArtistInfo | null>(cacheKey, 24 * 60 * 60, async () => {
    // Prefer mbid lookup — disambiguates artists with shared names. Fall back
    // to plain name when MB hasn't tagged the entity (rare for v1 sources).
    const params: Record<string, string> = mbid
      ? { method: "artist.getinfo", mbid }
      : { method: "artist.getinfo", artist: name };
    let data: LastFmArtistInfoResponse;
    try {
      data = await lastFmFetch<LastFmArtistInfoResponse>(config, params);
    } catch {
      return null;
    }
    const a = data.artist;
    if (!a) return null;

    const summary = a.bio?.summary ?? a.bio?.content ?? "";
    const cleaned = stripBioFooter(summary);
    const listeners = a.stats?.listeners ? Number(a.stats.listeners) : null;

    return {
      bio: cleaned.length > 0 ? cleaned : null,
      tags: (a.tags?.tag ?? []).map((t) => t.name ?? "").filter(Boolean),
      listeners: Number.isFinite(listeners as number) ? (listeners as number) : null,
    };
  });
}

type LastFmTopTracksResponse = {
  toptracks?: {
    track?: Array<{
      name?: string;
      mbid?: string;
      playcount?: string;
      listeners?: string;
    }>;
  };
};

export type LastFmTopTrack = {
  name: string;
  mbid: string | null;
  playcount: number;
  listeners: number;
};

export async function getArtistTopTracks(
  config: LastFmConfig,
  mbid: string | null,
  name: string,
  limit = 10,
): Promise<LastFmTopTrack[]> {
  const cacheKey = `lastfm:artist.gettoptracks:${(mbid ?? name).toLowerCase()}:${limit}`;
  return withCache<LastFmTopTrack[]>(cacheKey, 24 * 60 * 60, async () => {
    const params: Record<string, string> = mbid
      ? { method: "artist.gettoptracks", mbid, limit: String(limit) }
      : { method: "artist.gettoptracks", artist: name, limit: String(limit) };
    let data: LastFmTopTracksResponse;
    try {
      data = await lastFmFetch<LastFmTopTracksResponse>(config, params);
    } catch {
      return [];
    }
    return (data.toptracks?.track ?? [])
      .map((t) => ({
        name: t.name ?? "",
        mbid: t.mbid && t.mbid.length > 0 ? t.mbid : null,
        playcount: t.playcount ? Number(t.playcount) || 0 : 0,
        listeners: t.listeners ? Number(t.listeners) || 0 : 0,
      }))
      .filter((t) => t.name.length > 0);
  });
}

type LastFmSimilarTracksResponse = {
  similartracks?: {
    track?: Array<{
      name?: string;
      mbid?: string;
      // Last.fm returns match as a stringified float ("0.97…") on this endpoint.
      match?: string | number;
      // playcount is a bare number here (unlike the chart endpoints' strings).
      playcount?: string | number;
      artist?: { name?: string; mbid?: string };
    }>;
  };
};

export type LastFmSimilarTrack = {
  name: string;
  artistName: string;
  /** Recording MBID when Last.fm has one — null otherwise. */
  mbid: string | null;
  /** Similarity score 0–1; the relevance signal we rank candidates by. */
  match: number;
  playcount: number;
};

/**
 * Tracks similar to a seed song — Last.fm's `track.getsimilar`. This is the
 * engine behind playlist recommendations: given a song already in a playlist,
 * surface songs that "fit" alongside it. Prefer the recording MBID when we have
 * a real one (disambiguates covers/remakes); otherwise fall back to
 * artist+track name with autocorrect on. Returns [] on any error so a single
 * bad seed never sinks the whole recommendation batch.
 */
export async function getSimilarTracks(
  config: LastFmConfig,
  seed: { mbid?: string | null; artist: string; track: string },
  limit = 30,
): Promise<LastFmSimilarTrack[]> {
  const idKey = (seed.mbid ?? `${seed.artist}|${seed.track}`).toLowerCase();
  const cacheKey = `lastfm:track.getsimilar:${idKey}:${limit}`;
  return withCache<LastFmSimilarTrack[]>(cacheKey, 24 * 60 * 60, async () => {
    const params: Record<string, string> = seed.mbid
      ? { method: "track.getsimilar", mbid: seed.mbid, limit: String(limit) }
      : {
          method: "track.getsimilar",
          artist: seed.artist,
          track: seed.track,
          limit: String(limit),
          autocorrect: "1",
        };
    let data: LastFmSimilarTracksResponse;
    try {
      data = await lastFmFetch<LastFmSimilarTracksResponse>(config, params);
    } catch {
      return [];
    }
    return (data.similartracks?.track ?? [])
      .map((t) => ({
        name: t.name ?? "",
        artistName: t.artist?.name ?? "",
        mbid: t.mbid && t.mbid.length > 0 ? t.mbid : null,
        match: t.match != null ? Number(t.match) || 0 : 0,
        playcount: t.playcount != null ? Number(t.playcount) || 0 : 0,
      }))
      .filter((t) => t.name.length > 0 && t.artistName.length > 0);
  });
}
