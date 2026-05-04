// Minimal Deezer client: just enough to surface 30s previews and a cover for
// the album detail page. No auth required for read endpoints (design doc §4).

import { withCache } from "@/lib/cache";

const DEEZER_BASE = "https://api.deezer.com";

type DeezerSearchAlbumsResponse = {
  data?: Array<{
    id: number;
    title: string;
    artist?: { name?: string };
  }>;
};

type DeezerAlbumResponse = {
  id: number;
  title: string;
  cover_medium?: string;
  cover_big?: string;
  tracks?: {
    data?: Array<{
      id: number;
      title: string;
      preview?: string;
      duration?: number; // seconds
      track_position?: number;
    }>;
  };
};

export type DeezerTrackInfo = {
  previewUrl: string | null;
  durationMs: number | null;
};

export type DeezerAlbumMatch = {
  albumId: number;
  cover: string | null;
  /** Map of normalized track title → preview/duration. */
  trackByTitle: Record<string, DeezerTrackInfo>;
};

export function normalizeTrackTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\([^)]*\)/g, "") // drop parenthesised "(remastered)" etc.
    .replace(/\[[^\]]*\]/g, "")
    .replace(/[^\p{L}\p{N} ]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function deezerFetch<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const qs = new URLSearchParams(params).toString();
  const url = `${DEEZER_BASE}${path}${qs ? `?${qs}` : ""}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Deezer ${path} → HTTP ${res.status}`);
  return (await res.json()) as T;
}

type DeezerSearchArtistResponse = {
  data?: Array<{
    id: number;
    name: string;
    picture_xl?: string;
    picture_big?: string;
    picture_medium?: string;
  }>;
};

type DeezerArtistTopTracksResponse = {
  data?: Array<{
    id: number;
    title: string;
    preview?: string;
    duration?: number;
    album?: { title?: string; cover_medium?: string; cover_big?: string };
  }>;
};

type DeezerArtistRelatedResponse = {
  data?: Array<{
    id: number;
    name: string;
    picture_xl?: string;
    picture_big?: string;
    picture_medium?: string;
  }>;
};

export type DeezerArtistTopTrack = {
  title: string;
  previewUrl: string | null;
  durationMs: number | null;
  albumTitle: string | null;
  albumCover: string | null;
};

export type DeezerSimilarArtist = {
  name: string;
  imageUrl: string | null;
};

export type DeezerArtistBundle = {
  artistId: number;
  imageUrl: string | null;
  topTracks: DeezerArtistTopTrack[];
  similar: DeezerSimilarArtist[];
};

function pickArtistImage(a: {
  picture_xl?: string;
  picture_big?: string;
  picture_medium?: string;
}): string | null {
  // Deezer's CDN serves a generic silhouette when the artist has no picture.
  // The placeholder URL contains "/artist//" or a known empty-image hash —
  // simplest filter: drop anything missing every size variant.
  return a.picture_xl ?? a.picture_big ?? a.picture_medium ?? null;
}

/**
 * Find an artist on Deezer by name, then fetch their top tracks (with 30s
 * previews) and related artists in parallel. One bundle to keep the artist
 * page's data fetch simple.
 */
export async function getDeezerArtistBundle(
  artistName: string,
  topTrackLimit = 10,
  similarLimit = 8,
): Promise<DeezerArtistBundle | null> {
  const cacheKey = `deezer:artist:bundle:${normalizeTrackTitle(artistName)}:${topTrackLimit}:${similarLimit}`;
  return withCache<DeezerArtistBundle | null>(
    cacheKey,
    7 * 24 * 60 * 60,
    async () => {
      let search: DeezerSearchArtistResponse;
      try {
        search = await deezerFetch<DeezerSearchArtistResponse>("/search/artist", {
          q: artistName,
          limit: "10",
        });
      } catch {
        return null;
      }

      const want = normalizeTrackTitle(artistName);
      const candidates = search.data ?? [];
      const exact = candidates.find(
        (a) => normalizeTrackTitle(a.name ?? "") === want,
      );
      const hit = exact ?? candidates[0];
      if (!hit) return null;

      const [topRes, relRes] = await Promise.allSettled([
        deezerFetch<DeezerArtistTopTracksResponse>(
          `/artist/${hit.id}/top`,
          { limit: String(topTrackLimit) },
        ),
        deezerFetch<DeezerArtistRelatedResponse>(
          `/artist/${hit.id}/related`,
          { limit: String(similarLimit) },
        ),
      ]);

      const topTracks: DeezerArtistTopTrack[] =
        topRes.status === "fulfilled"
          ? (topRes.value.data ?? []).map((t) => ({
              title: t.title,
              previewUrl: t.preview ? t.preview : null,
              durationMs: typeof t.duration === "number" ? t.duration * 1000 : null,
              albumTitle: t.album?.title ?? null,
              albumCover: t.album?.cover_big ?? t.album?.cover_medium ?? null,
            }))
          : [];

      const similar: DeezerSimilarArtist[] =
        relRes.status === "fulfilled"
          ? (relRes.value.data ?? []).map((a) => ({
              name: a.name,
              imageUrl: pickArtistImage(a),
            }))
          : [];

      return {
        artistId: hit.id,
        imageUrl: pickArtistImage(hit),
        topTracks,
        similar,
      };
    },
  );
}

// Maps Audioseerr's genre slugs to Deezer's numeric genre IDs (from /genre).
// Slugs without an entry fall through to a Last.fm lookup at the call-site.
const DEEZER_GENRE_IDS: Record<string, number> = {
  pop: 132,
  rock: 152,
  electronic: 106,
  "hip-hop": 116,
  alternative: 85,
  jazz: 129,
  classical: 98,
  metal: 464,
  folk: 466,
  soul: 169,
};

export type DeezerChartAlbum = {
  /** Deezer doesn't expose MBIDs; cards fall back to a search link. */
  mbid: null;
  title: string;
  artistName: string;
  artistMbid: null;
  coverUrl: string | null;
};

type DeezerChartAlbumsResponse = {
  data?: Array<{
    id: number;
    title: string;
    cover_xl?: string;
    cover_big?: string;
    cover_medium?: string;
    artist?: { id?: number; name?: string };
  }>;
};

export function hasDeezerChartGenre(slug: string): boolean {
  return slug.toLowerCase() in DEEZER_GENRE_IDS;
}

/**
 * Top albums chart for a Deezer genre. Unlike Last.fm's tag.gettopalbums
 * (all-time scrobbles), Deezer's chart reflects current play activity, so
 * recent releases can actually surface.
 */
export async function getDeezerChartAlbums(
  genreSlug: string,
  limit = 12,
): Promise<DeezerChartAlbum[]> {
  const id = DEEZER_GENRE_IDS[genreSlug.toLowerCase()];
  if (id === undefined) return [];
  const cacheKey = `deezer:chart:albums:${id}:${limit}`;
  return withCache<DeezerChartAlbum[]>(cacheKey, 60 * 60, async () => {
    let data: DeezerChartAlbumsResponse;
    try {
      data = await deezerFetch<DeezerChartAlbumsResponse>(
        `/chart/${id}/albums`,
        { limit: String(limit) },
      );
    } catch {
      return [];
    }
    return (data.data ?? [])
      .map<DeezerChartAlbum>((a) => ({
        mbid: null,
        title: a.title,
        artistName: a.artist?.name ?? "Unknown artist",
        artistMbid: null,
        coverUrl: a.cover_xl ?? a.cover_big ?? a.cover_medium ?? null,
      }))
      .filter((a) => a.title.length > 0);
  });
}

export async function findAlbumPreviews(
  artistName: string,
  albumTitle: string,
): Promise<DeezerAlbumMatch | null> {
  const cacheKey = `deezer:album:${normalizeTrackTitle(artistName)}:${normalizeTrackTitle(albumTitle)}`;
  return withCache<DeezerAlbumMatch | null>(cacheKey, 7 * 24 * 60 * 60, async () => {
    // Plain-text query — Deezer's fielded `artist:"X" album:"Y"` syntax
    // returns 0 results for many real titles, so we filter on our side.
    const search = await deezerFetch<DeezerSearchAlbumsResponse>("/search/album", {
      q: `${artistName} ${albumTitle}`,
      limit: "10",
    });

    const wantArtist = normalizeTrackTitle(artistName);
    const wantTitle = normalizeTrackTitle(albumTitle);

    const sameArtist = (search.data ?? []).filter(
      (a) => normalizeTrackTitle(a.artist?.name ?? "") === wantArtist,
    );
    const exact = sameArtist.find(
      (a) => normalizeTrackTitle(a.title ?? "") === wantTitle,
    );
    const hit = exact ?? sameArtist[0];
    if (!hit) return null;

    let album: DeezerAlbumResponse;
    try {
      album = await deezerFetch<DeezerAlbumResponse>(`/album/${hit.id}`);
    } catch {
      return null;
    }

    const trackByTitle: Record<string, DeezerTrackInfo> = {};
    for (const t of album.tracks?.data ?? []) {
      trackByTitle[normalizeTrackTitle(t.title)] = {
        previewUrl: t.preview ? t.preview : null,
        durationMs: typeof t.duration === "number" ? t.duration * 1000 : null,
      };
    }

    return {
      albumId: album.id,
      cover: album.cover_big ?? album.cover_medium ?? null,
      trackByTitle,
    };
  });
}
