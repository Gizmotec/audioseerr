// Track source for genres Deezer's chart API doesn't map (e.g. indie, ambient).
// Last.fm has tag.gettoptracks but no album/preview, and the inline-download
// path needs an album title to resolve a track to MusicBrainz. So we take the
// Last.fm tag tracks and enrich each through Deezer to recover the album + cover.
//
// Deliberately self-contained (own Last.fm fetch, reuses the already-exported
// getDeezerTrackArtwork) so it doesn't touch lastfm.ts / deezer.ts while a
// parallel feature has uncommitted changes there.

import { withCache } from "@/lib/cache";
import { type DiscoveryTrack, getDeezerTrackArtwork } from "@/lib/deezer";

const LASTFM_BASE = "https://ws.audioscrobbler.com/2.0/";

type LastFmTagTracksResponse = {
  tracks?: {
    track?: Array<{
      name?: string;
      artist?: { name?: string };
    }>;
  };
};

/**
 * Up to `limit` downloadable tracks for a Last.fm tag. Each Last.fm track is
 * enriched via Deezer for its album + cover; tracks Deezer can't place on an
 * album are dropped (no album title → not resolvable → not downloadable).
 * Previews aren't available on this path, so previewUrl is null.
 */
export async function getGenreFallbackTracks(
  tag: string,
  lastFmKey: string | null | undefined,
  limit = 24,
): Promise<DiscoveryTrack[]> {
  if (!lastFmKey) return [];
  const slug = tag.trim().toLowerCase();
  if (!slug) return [];

  return withCache<DiscoveryTrack[]>(
    `genre:fallback:tracks:${slug}:${limit}`,
    60 * 60,
    async () => {
      let data: LastFmTagTracksResponse;
      try {
        const url = `${LASTFM_BASE}?method=tag.gettoptracks&tag=${encodeURIComponent(
          slug,
        )}&api_key=${encodeURIComponent(lastFmKey)}&format=json&limit=${limit}`;
        const res = await fetch(url, { headers: { Accept: "application/json" } });
        if (!res.ok) return [];
        data = (await res.json()) as LastFmTagTracksResponse;
      } catch {
        return [];
      }

      const seeds = (data.tracks?.track ?? [])
        .map((t) => ({ title: t.name ?? "", artistName: t.artist?.name ?? "" }))
        .filter((t) => t.title && t.artistName);

      const enriched = await Promise.all(
        seeds.map(async (seed): Promise<DiscoveryTrack | null> => {
          const art = await getDeezerTrackArtwork({
            artistName: seed.artistName,
            trackName: seed.title,
          }).catch(() => null);
          if (!art?.albumTitle) return null; // can't resolve a download without it
          return {
            title: seed.title,
            artistName: seed.artistName,
            albumTitle: art.albumTitle,
            coverUrl: art.imageUrl,
            previewUrl: null,
            durationMs: null,
          };
        }),
      );

      return enriched.filter((t): t is DiscoveryTrack => t !== null);
    },
  );
}
