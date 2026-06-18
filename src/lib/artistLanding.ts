import type { ArtistTopTrack } from "@/components/TopTracksList";
import { getDeezerArtistBundle, normalizeTrackTitle } from "@/lib/deezer";
import { getArtistInfo, getArtistTopTracks } from "@/lib/lastfm";
import { getArtist, type MbAlbum } from "@/lib/musicbrainz";

export type ArtistLanding = {
  mbid: string;
  name: string;
  type: string | null;
  imageUrl: string | null;
  meta: string;
  topTracks: ArtistTopTrack[];
  albums: MbAlbum[];
};

const STUDIO = new Set(["Album", "EP"]);
const NON_STUDIO_SECONDARY =
  /compilation|live|remix|dj-mix|mixtape|demo|soundtrack/i;

function rankType(primaryType: string | null): number {
  return primaryType === "Album" ? 0 : primaryType === "EP" ? 1 : 2;
}

function formatListeners(n: number): string {
  if (n >= 1_000_000) {
    const v = n / 1_000_000;
    return `${v >= 10 ? Math.round(v) : v.toFixed(1)}M`;
  }
  if (n >= 1_000) {
    const v = n / 1_000;
    return `${v >= 10 ? Math.round(v) : v.toFixed(1)}K`;
  }
  return n.toLocaleString();
}

/**
 * Assemble the "artist landing" shown at the top of search when the query
 * matches an artist: image + meta, their popular songs (Deezer top tracks
 * enriched with Last.fm listener counts), and their real studio discography.
 * Mirrors the artist page's data load so the two stay consistent.
 */
export async function loadArtistLanding(
  mbid: string,
  lastFmKey: string | null,
  topTrackLimit = 6,
): Promise<ArtistLanding | null> {
  const artist = await getArtist(mbid);
  if (!artist) return null;

  const [bundle, info, lfm] = await Promise.all([
    getDeezerArtistBundle(artist.name).catch(() => null),
    lastFmKey
      ? getArtistInfo({ apiKey: lastFmKey }, artist.mbid, artist.name).catch(
          () => null,
        )
      : Promise.resolve(null),
    lastFmKey
      ? getArtistTopTracks(
          { apiKey: lastFmKey },
          artist.mbid,
          artist.name,
          50,
        ).catch(() => [])
      : Promise.resolve([]),
  ]);

  const lfmByNorm = new Map<string, { listeners: number; playcount: number }>();
  for (const t of lfm) {
    const k = normalizeTrackTitle(t.name);
    if (k && !lfmByNorm.has(k)) {
      lfmByNorm.set(k, { listeners: t.listeners, playcount: t.playcount });
    }
  }
  const topTracks: ArtistTopTrack[] = (bundle?.topTracks ?? [])
    .map((t) => {
      const s = lfmByNorm.get(normalizeTrackTitle(t.title));
      return { ...t, listeners: s?.listeners ?? null, playcount: s?.playcount ?? null };
    })
    .slice(0, topTrackLimit);

  const albums: MbAlbum[] = artist.releaseGroups
    .filter(
      (rg) =>
        STUDIO.has(rg.primaryType ?? "") &&
        !(rg.secondaryTypes ?? []).some((s) => NON_STUDIO_SECONDARY.test(s)),
    )
    .sort(
      (a, b) =>
        rankType(a.primaryType) - rankType(b.primaryType) ||
        (b.firstReleaseDate ?? "").localeCompare(a.firstReleaseDate ?? ""),
    )
    .map((rg) => ({
      mbid: rg.mbid,
      title: rg.title,
      artistName: artist.name,
      artistMbid: artist.mbid,
      firstReleaseDate: rg.firstReleaseDate,
      primaryType: rg.primaryType,
      coverUrl: rg.coverUrl,
    }));

  const meta = [
    artist.type ?? "Artist",
    info?.listeners ? `${formatListeners(info.listeners)} listeners` : null,
    `${albums.length} album${albums.length === 1 ? "" : "s"}`,
  ]
    .filter((x): x is string => !!x)
    .join(" · ");

  return {
    mbid: artist.mbid,
    name: artist.name,
    type: artist.type,
    imageUrl: bundle?.imageUrl ?? null,
    meta,
    topTracks,
    albums,
  };
}
