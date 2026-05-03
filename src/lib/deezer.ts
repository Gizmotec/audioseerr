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
