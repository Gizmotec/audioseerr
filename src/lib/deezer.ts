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

/**
 * Looser key for deciding two records are the SAME song across metadata sources
 * — a downloaded copy (MusicBrainz, at request time) vs a discovery pick
 * (Deezer). On top of normalizeTrackTitle it folds diacritics and drops the
 * extras that only one source tends to carry: a non-parenthesised "feat."
 * credit, a " - 2024 Remaster"/"- Live" qualifier, and "&" vs "and".
 * ponytail: deliberately forgiving — may treat a remix/live cut as already-owned
 * and hide it from a mix. Fine for discovery; tighten with album/MBID matching
 * if real songs start getting hidden.
 */
export function trackMatchKey(artist: string, title: string): string {
  return `${matchNormalize(artist)}|${matchNormalize(title)}`;
}

function matchNormalize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics (Beyoncé → Beyonce)
    .toLowerCase()
    .replace(/\([^)]*\)/g, "") // (remastered)
    .replace(/\[[^\]]*\]/g, "") // [explicit]
    .replace(/\s+-\s+.*$/, "") // " - 2024 Remaster", " - Live at X"
    .replace(/\b(?:feat|ft|featuring)\b\.?.*$/i, "") // feat. credits
    .replace(/&/g, " and ")
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

type DeezerArtistTopForArtworkResponse = {
  data?: Array<{
    album?: {
      cover_xl?: string;
      cover_big?: string;
      cover_medium?: string;
    };
  }>;
};

type DeezerSearchTracksResponse = {
  data?: Array<{
    id: number;
    title: string;
    artist?: { name?: string };
    album?: {
      title?: string;
      cover_xl?: string;
      cover_big?: string;
      cover_medium?: string;
    };
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

export type DeezerTrackArtwork = {
  imageUrl: string | null;
  albumTitle: string | null;
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
  // A few artists also return a near-black legal/placeholder image. Treat that
  // as unusable so the chart can fall back to album art instead.
  const url = a.picture_xl ?? a.picture_big ?? a.picture_medium ?? null;
  if (!url) return null;
  if (url.includes("bb76c2ee3b068726ab4c37b0aabdb57a")) return null;
  return url;
}

function pickTrackCover(t: {
  album?: {
    cover_xl?: string;
    cover_big?: string;
    cover_medium?: string;
  };
}): string | null {
  return t.album?.cover_xl ?? t.album?.cover_big ?? t.album?.cover_medium ?? null;
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

export async function getDeezerArtistArtwork(
  artistName: string,
): Promise<string | null> {
  const cacheKey = `deezer:artist:artwork:v2:${normalizeTrackTitle(artistName)}`;
  return withCache<string | null>(cacheKey, 7 * 24 * 60 * 60, async () => {
    let search: DeezerSearchArtistResponse;
    try {
      search = await deezerFetch<DeezerSearchArtistResponse>("/search/artist", {
        q: artistName,
        limit: "5",
      });
    } catch {
      return null;
    }

    const want = normalizeTrackTitle(artistName);
    const candidates = search.data ?? [];
    const exact = candidates.find((a) => normalizeTrackTitle(a.name) === want);
    const hit = exact ?? candidates[0];
    if (!hit) return null;

    const profileImage = pickArtistImage(hit);
    if (profileImage) return profileImage;

    try {
      const top = await deezerFetch<DeezerArtistTopForArtworkResponse>(
        `/artist/${hit.id}/top`,
        { limit: "1" },
      );
      const album = top.data?.[0]?.album;
      return album?.cover_xl ?? album?.cover_big ?? album?.cover_medium ?? null;
    } catch {
      return null;
    }
  });
}

export async function getDeezerTrackArtwork({
  artistName,
  trackName,
}: {
  artistName: string;
  trackName: string;
}): Promise<DeezerTrackArtwork> {
  const cacheKey = `deezer:track:artwork:v2:${normalizeTrackTitle(artistName)}:${normalizeTrackTitle(trackName)}`;
  return withCache<DeezerTrackArtwork>(cacheKey, 7 * 24 * 60 * 60, async () => {
    let search: DeezerSearchTracksResponse;
    try {
      search = await deezerFetch<DeezerSearchTracksResponse>("/search/track", {
        q: `${artistName} ${trackName}`,
        limit: "8",
      });
    } catch {
      return { imageUrl: null, albumTitle: null };
    }

    const wantArtist = normalizeTrackTitle(artistName);
    const wantTrack = normalizeTrackTitle(trackName);
    const candidates = search.data ?? [];
    const exact = candidates.find(
      (t) =>
        normalizeTrackTitle(t.artist?.name ?? "") === wantArtist &&
        normalizeTrackTitle(t.title) === wantTrack,
    );
    const sameArtist = candidates.find(
      (t) => normalizeTrackTitle(t.artist?.name ?? "") === wantArtist,
    );
    const hit = exact ?? sameArtist ?? candidates[0];
    return hit
      ? {
          imageUrl: pickTrackCover(hit),
          albumTitle: hit.album?.title ?? null,
        }
      : { imageUrl: null, albumTitle: null };
  });
}

type DeezerSearchTracksFullResponse = {
  data?: Array<{
    id: number;
    title: string;
    preview?: string;
    duration?: number; // seconds
    artist?: { name?: string };
    album?: {
      title?: string;
      cover_xl?: string;
      cover_big?: string;
      cover_medium?: string;
    };
  }>;
};

export type DeezerTrackMatch = {
  title: string;
  artistName: string;
  albumTitle: string | null;
  coverUrl: string | null;
  previewUrl: string | null;
  durationMs: number | null;
};

/**
 * Resolve a song known only by artist + title (e.g. a Last.fm recommendation)
 * to a concrete Deezer track, returning its album title, cover, 30s preview and
 * duration. Used to enrich playlist recommendations: the album title is what
 * makes a suggestion downloadable (it's the key the MusicBrainz resolver needs),
 * and the preview lets the user audition before adding.
 *
 * Strict on purpose — only an exact (normalized) artist *and* title match is
 * accepted. A loose match would attach the wrong album and download the wrong
 * song, so we'd rather return null and let the caller drop the candidate.
 */
export async function findDeezerTrack({
  artistName,
  trackName,
}: {
  artistName: string;
  trackName: string;
}): Promise<DeezerTrackMatch | null> {
  const cacheKey = `deezer:track:match:v1:${normalizeTrackTitle(artistName)}:${normalizeTrackTitle(trackName)}`;
  return withCache<DeezerTrackMatch | null>(cacheKey, 7 * 24 * 60 * 60, async () => {
    let search: DeezerSearchTracksFullResponse;
    try {
      search = await deezerFetch<DeezerSearchTracksFullResponse>("/search/track", {
        q: `${artistName} ${trackName}`,
        limit: "10",
      });
    } catch {
      return null;
    }

    const wantArtist = normalizeTrackTitle(artistName);
    const wantTrack = normalizeTrackTitle(trackName);
    const hit = (search.data ?? []).find(
      (t) =>
        normalizeTrackTitle(t.artist?.name ?? "") === wantArtist &&
        normalizeTrackTitle(t.title) === wantTrack,
    );
    if (!hit) return null;

    return {
      title: hit.title,
      artistName: hit.artist?.name ?? artistName,
      albumTitle: hit.album?.title ?? null,
      coverUrl: pickTrackCover(hit),
      previewUrl: hit.preview ? hit.preview : null,
      durationMs: typeof hit.duration === "number" ? hit.duration * 1000 : null,
    };
  });
}

// Maps Audioseerr's genre slugs to Deezer's numeric genre IDs (from /genre).
// Slugs without an entry fall through to a Last.fm lookup at the call-site.
const DEEZER_GENRE_IDS: Record<string, number> = {
  pop: 132,
  rock: 152,
  electronic: 106, // Deezer "Electro"
  "hip-hop": 116, // Deezer "Rap/Hip Hop"
  dance: 113,
  rnb: 165, // Deezer "R&B" — slug avoids "&" so it survives URL round-trips
  alternative: 85,
  jazz: 129,
  classical: 98,
  metal: 464,
  folk: 466,
  soul: 169, // Deezer "Soul & Funk"
  reggae: 144,
  country: 84,
  blues: 153,
  latin: 197,
  soundtrack: 173, // Deezer "Films/Games"
};

export type DeezerChartAlbum = {
  /** Deezer doesn't expose MBIDs; cards fall back to a search link. */
  mbid: null;
  title: string;
  artistName: string;
  artistMbid: null;
  coverUrl: string | null;
};

/**
 * A song surfaced on the (track-first) discover page. Carries only what Deezer
 * gives us — no MusicBrainz ids — so downloading one is resolved to MB on click
 * (see requestDiscoveryTrackAction), not at page load.
 */
export type DiscoveryTrack = {
  title: string;
  artistName: string;
  albumTitle: string | null;
  coverUrl: string | null;
  previewUrl: string | null;
  durationMs: number | null;
};

type DeezerChartTracksResponse = {
  data?: Array<{
    id: number;
    title: string;
    preview?: string;
    duration?: number; // seconds
    artist?: { name?: string };
    album?: {
      title?: string;
      cover_xl?: string;
      cover_big?: string;
      cover_medium?: string;
    };
  }>;
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

type DeezerEditorialReleasesResponse = {
  data?: Array<{
    id: number;
    title: string;
    cover_xl?: string;
    cover_big?: string;
    cover_medium?: string;
    release_date?: string;
    artist?: { id?: number; name?: string };
  }>;
};

export function hasDeezerChartGenre(slug: string): boolean {
  return slug.toLowerCase() in DEEZER_GENRE_IDS;
}

// Genre slugs whose title-cased form needs an override (acronyms, ampersands).
const GENRE_LABELS: Record<string, string> = {
  "hip-hop": "Hip-Hop",
  rnb: "R&B",
};

/** Human label for a genre slug; falls back to the slug (callers title-case). */
export function genreLabel(slug: string): string {
  return GENRE_LABELS[slug.toLowerCase()] ?? slug;
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

/**
 * Deezer editorial releases are the closest keyless source we have for a true
 * "new releases" shelf. Last.fm exposes charts, but not release-date feeds.
 */
export async function getDeezerNewReleaseAlbums(
  limit = 12,
): Promise<DeezerChartAlbum[]> {
  const cacheKey = `deezer:editorial:releases:${limit}`;
  return withCache<DeezerChartAlbum[]>(cacheKey, 60 * 60, async () => {
    let data: DeezerEditorialReleasesResponse;
    try {
      data = await deezerFetch<DeezerEditorialReleasesResponse>(
        "/editorial/0/releases",
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

/**
 * Top tracks chart for a Deezer genre, or the global chart when `genreSlug` is
 * null (Deezer genre id 0). The track-first analogue of getDeezerChartAlbums —
 * the same play-activity chart, but at the song level. Unknown slugs return [].
 */
export async function getDeezerChartTracks(
  genreSlug: string | null,
  limit = 12,
): Promise<DiscoveryTrack[]> {
  const id =
    genreSlug === null ? 0 : DEEZER_GENRE_IDS[genreSlug.toLowerCase()];
  if (id === undefined) return [];
  const cacheKey = `deezer:chart:tracks:${id}:${limit}`;
  return withCache<DiscoveryTrack[]>(cacheKey, 60 * 60, async () => {
    let data: DeezerChartTracksResponse;
    try {
      data = await deezerFetch<DeezerChartTracksResponse>(
        `/chart/${id}/tracks`,
        { limit: String(limit) },
      );
    } catch {
      return [];
    }
    return (data.data ?? [])
      .map<DiscoveryTrack>((t) => ({
        title: t.title,
        artistName: t.artist?.name ?? "Unknown artist",
        albumTitle: t.album?.title ?? null,
        coverUrl: pickTrackCover(t),
        previewUrl: t.preview ? t.preview : null,
        durationMs: typeof t.duration === "number" ? t.duration * 1000 : null,
      }))
      .filter((t) => t.title.length > 0);
  });
}

/**
 * "Fresh tracks" for the discover page: Deezer editorial new releases (albums),
 * each resolved to its opening track so the shelf reads as songs. Best-effort —
 * an album whose tracklist fails to load is dropped.
 */
export async function getDeezerNewReleaseTracks(
  limit = 12,
): Promise<DiscoveryTrack[]> {
  const cacheKey = `deezer:editorial:release-tracks:${limit}`;
  return withCache<DiscoveryTrack[]>(cacheKey, 60 * 60, async () => {
    let data: DeezerEditorialReleasesResponse;
    try {
      data = await deezerFetch<DeezerEditorialReleasesResponse>(
        "/editorial/0/releases",
        { limit: String(limit) },
      );
    } catch {
      return [];
    }
    const albums = (data.data ?? []).filter((a) => (a.title ?? "").length > 0);
    const resolved = await Promise.all(
      albums.map(async (a): Promise<DiscoveryTrack | null> => {
        let album: DeezerAlbumResponse;
        try {
          album = await deezerFetch<DeezerAlbumResponse>(`/album/${a.id}`);
        } catch {
          return null;
        }
        const first = [...(album.tracks?.data ?? [])].sort(
          (x, y) => (x.track_position ?? 0) - (y.track_position ?? 0),
        )[0];
        if (!first) return null;
        return {
          title: first.title,
          artistName: a.artist?.name ?? "Unknown artist",
          albumTitle: a.title,
          coverUrl: a.cover_xl ?? a.cover_big ?? a.cover_medium ?? null,
          previewUrl: first.preview ? first.preview : null,
          durationMs:
            typeof first.duration === "number" ? first.duration * 1000 : null,
        };
      }),
    );
    return resolved.filter((t): t is DiscoveryTrack => t !== null);
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
