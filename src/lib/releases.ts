// Server-side orchestration for the /releases feed ("new albums from artists
// in your library"). Pure merge/filter logic lives in releaseFeed.ts.
//
// Data path note: the original design called for a per-user `Listen` model
// carrying artistName + artistMbid, but no such model exists in the schema.
// The closest real sources of "artists in your library" are used instead:
//   1. ARTIST Likes — targetId is a real artist MBID, free to read.
//   2. The user's PlayHistory rows (the actual "listen rows") — they carry
//      albumMbid but no artistMbid, so the owning artist is resolved through
//      a cheap, long-cached release-group lookup (getAlbumArtist).
// The union is capped at MAX_ARTISTS to bound the MusicBrainz fan-out; every
// external call is ApiCache-backed, so steady-state renders hit no network.

import { prisma } from "@/lib/db";
import {
  getAlbumArtist,
  getRecentArtistAlbums,
  type MbAlbum,
} from "@/lib/musicbrainz";
import {
  mergeRecentReleases,
  RELEASE_WINDOW_DAYS,
  sinceDateString,
} from "@/lib/releaseFeed";

const MAX_ARTISTS = 100;
/** Distinct played albums to resolve for artist MBIDs (1 cached MB call each). */
const MAX_ALBUM_LOOKUPS = 60;

async function getLibraryArtists(
  userId: string,
): Promise<{ mbid: string; name: string }[]> {
  const [likes, playedAlbums] = await Promise.all([
    prisma.like.findMany({
      where: { userId, targetType: "ARTIST" },
      orderBy: { createdAt: "desc" },
      take: MAX_ARTISTS,
      select: { targetId: true, title: true },
    }),
    prisma.playHistory.groupBy({
      by: ["albumMbid"],
      where: { userId, albumMbid: { not: null } },
      _max: { playedAt: true },
      orderBy: { _max: { playedAt: "desc" } },
      take: MAX_ALBUM_LOOKUPS,
    }),
  ]);

  const artists: { mbid: string; name: string }[] = [];
  const seen = new Set<string>();
  const push = (mbid: string | null, name: string) => {
    if (!mbid || seen.has(mbid)) return;
    seen.add(mbid);
    artists.push({ mbid, name });
  };
  for (const like of likes) push(like.targetId, like.title);

  // Resolve played albums → owning artist. Cache hits are DB-only; misses are
  // rate-limited by the shared MB limiter, so a cold first render paces
  // itself instead of hammering MusicBrainz.
  const albumMbids = playedAlbums.flatMap((g) => (g.albumMbid ? [g.albumMbid] : []));
  const resolved = await Promise.all(
    albumMbids.map((mbid) => getAlbumArtist(mbid)),
  );
  for (const artist of resolved) push(artist?.mbid ?? null, artist?.name ?? "");

  return artists.slice(0, MAX_ARTISTS);
}

/**
 * New albums (last RELEASE_WINDOW_DAYS days) from the user's library artists,
 * newest first, deduped by release-group MBID, capped at RELEASE_FEED_LIMIT.
 * Per-artist failures degrade to an empty list rather than sinking the feed.
 * artistCount accompanies the feed so the page can tell "empty library" apart
 * from "no releases lately".
 */
export async function getNewReleasesForUser(
  userId: string,
): Promise<{ artistCount: number; releases: MbAlbum[] }> {
  const artists = await getLibraryArtists(userId);
  if (artists.length === 0) return { artistCount: 0, releases: [] };

  const now = new Date();
  const since = sinceDateString(now, RELEASE_WINDOW_DAYS);
  const lists = await Promise.all(
    artists.map(async (artist) => {
      try {
        return await getRecentArtistAlbums(artist.mbid, since);
      } catch (e) {
        console.warn(`[releases] fetch failed for artist ${artist.mbid}:`, e);
        return [];
      }
    }),
  );
  return {
    artistCount: artists.length,
    releases: mergeRecentReleases(lists, { now }),
  };
}
