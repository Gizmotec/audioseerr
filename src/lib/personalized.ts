// Personalized suggestions for /discover. Four row generators:
//   1. getSimilarAlbumsForLikedArtists — Last.fm similar artists → top album
//   2. getMoreFromLibraryArtists — unowned release-groups by library artists
//   3. getNewReleasesFromLibraryArtists — same, filtered to last 18 months
//   4. getRecommendedForYou — light blend of the above for the hero row
//
// Each generator caches per-user with a 6h TTL via ApiCache. Empty rows are
// cached too — the discover page checks `albums.length` before rendering.
//
// All generators tolerate every external dependency failing: missing Last.fm
// key, Lidarr down, MB rate-limited, no signal at all. They return `[]`,
// never throw, so a failing row never blocks the page.
import { withCache } from "@/lib/cache";
import { prisma } from "@/lib/db";
import {
  type LastFmConfig,
  getArtistTopAlbums,
  getSimilarArtists,
} from "@/lib/lastfm";
import { type LibraryIndex } from "@/lib/library";
import { type LidarrConfig, listArtists } from "@/lib/lidarr";
import { getArtist as getMbArtist } from "@/lib/musicbrainz";

export type PersonalizedAlbum = {
  mbid: string | null;
  title: string;
  artistName: string;
  coverUrl: string | null;
};

const CACHE_TTL_SECONDS = 6 * 60 * 60;
const ROW_LIMIT = 12;

const NEW_RELEASE_WINDOW_MS = 18 * 30 * 24 * 60 * 60 * 1000;

function coverUrlForReleaseGroup(mbid: string): string {
  return `https://coverartarchive.org/release-group/${mbid}/front-250`;
}

/**
 * Pick the user's strongest "seed" artist for similar-artist recommendations.
 * Priority: most-recent ARTIST like → most-recent ALBUM/TRACK like (artistName).
 * Returns null when the user has no likes at all.
 */
async function pickSeedLikedArtist(
  userId: string,
): Promise<{ mbid: string | null; name: string } | null> {
  const artistLike = await prisma.like.findFirst({
    where: { userId, targetType: "ARTIST" },
    orderBy: { createdAt: "desc" },
    select: { targetId: true, title: true, artistName: true },
  });
  if (artistLike) {
    return {
      mbid: artistLike.targetId,
      name: artistLike.artistName ?? artistLike.title,
    };
  }

  const otherLike = await prisma.like.findFirst({
    where: { userId, artistName: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { artistName: true },
  });
  if (otherLike?.artistName) {
    return { mbid: null, name: otherLike.artistName };
  }
  return null;
}

/**
 * Map artist names → Lidarr MBIDs for the artists in our library. Lidarr is
 * the only place we reliably have artist MBIDs alongside artist names; the
 * LibraryItem table only stores the album mbid. Falls back to an empty map
 * when Lidarr is unreachable, which downgrades library-artist rows to empty.
 */
async function getLibraryArtistMbids(
  config: LidarrConfig,
): Promise<Map<string, string>> {
  let artists;
  try {
    artists = await listArtists(config);
  } catch {
    return new Map();
  }
  const out = new Map<string, string>();
  for (const a of artists) {
    if (a.foreignArtistId && a.artistName) out.set(a.artistName, a.foreignArtistId);
  }
  return out;
}

/**
 * Top library artists, ranked by album count then track count. Reused by both
 * library-artist rows. Returns up to `limit` (artistName, mbid) pairs.
 */
async function topLibraryArtists(
  lidarr: LidarrConfig,
  limit: number,
): Promise<Array<{ name: string; mbid: string }>> {
  const items = await prisma.libraryItem.findMany({
    select: { artistName: true, trackFileCount: true },
  });
  if (items.length === 0) return [];

  type Agg = { name: string; albumCount: number; trackFileCount: number };
  const byName = new Map<string, Agg>();
  for (const item of items) {
    const cur = byName.get(item.artistName) ?? {
      name: item.artistName,
      albumCount: 0,
      trackFileCount: 0,
    };
    cur.albumCount += 1;
    cur.trackFileCount += item.trackFileCount;
    byName.set(item.artistName, cur);
  }

  const ranked = Array.from(byName.values()).sort((a, b) => {
    if (b.albumCount !== a.albumCount) return b.albumCount - a.albumCount;
    return b.trackFileCount - a.trackFileCount;
  });

  const mbidByName = await getLibraryArtistMbids(lidarr);
  const out: Array<{ name: string; mbid: string }> = [];
  for (const r of ranked) {
    const mbid = mbidByName.get(r.name);
    if (!mbid) continue;
    out.push({ name: r.name, mbid });
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * "Because you liked [Artist]" — pick a seed liked artist, fetch ~12 similar
 * artists from Last.fm, pick the top album for each. Filters out anything
 * already in the library so the row drives genuinely new requests.
 */
export async function getSimilarAlbumsForLikedArtists(
  userId: string,
  lastFm: LastFmConfig | null,
  library: LibraryIndex,
): Promise<{ seedArtistName: string | null; albums: PersonalizedAlbum[] }> {
  if (!lastFm) return { seedArtistName: null, albums: [] };

  return withCache(
    `personalized:v1:liked-similar:${userId}`,
    CACHE_TTL_SECONDS,
    async () => {
      const seed = await pickSeedLikedArtist(userId);
      if (!seed) return { seedArtistName: null, albums: [] };

      const similar = await getSimilarArtists(lastFm, seed.mbid, seed.name, 16);
      if (similar.length === 0) {
        return { seedArtistName: seed.name, albums: [] };
      }

      const topAlbums = await Promise.all(
        similar.map((a) =>
          getArtistTopAlbums(lastFm, a.mbid, a.name, 1).catch(() => []),
        ),
      );

      const seenArtists = new Set<string>([seed.name.toLowerCase()]);
      const out: PersonalizedAlbum[] = [];
      for (const albums of topAlbums) {
        if (albums.length === 0) continue;
        const a = albums[0]!;
        const artistKey = a.artistName.toLowerCase();
        if (seenArtists.has(artistKey)) continue;

        const candidate: PersonalizedAlbum = {
          mbid: a.mbid,
          title: a.title,
          artistName: a.artistName,
          coverUrl: a.coverUrl,
        };

        if (
          library.lookup({
            mbid: candidate.mbid,
            artistName: candidate.artistName,
            title: candidate.title,
          })
        ) {
          continue;
        }

        seenArtists.add(artistKey);
        out.push(candidate);
        if (out.length >= ROW_LIMIT) break;
      }
      return { seedArtistName: seed.name, albums: out };
    },
  );
}

/**
 * "More from artists in your library" — for each top library artist, fetch
 * their full release-group list from MusicBrainz and surface ones that aren't
 * already in the library. Newest-first per artist; round-robin across artists
 * so the row isn't dominated by a single discography.
 */
export async function getMoreFromLibraryArtists(
  userId: string,
  lidarr: LidarrConfig | null,
  library: LibraryIndex,
): Promise<PersonalizedAlbum[]> {
  if (!lidarr) return [];

  return withCache(
    `personalized:v1:more-from-library:${userId}`,
    CACHE_TTL_SECONDS,
    () => fetchUnownedAlbumsForLibraryArtists(lidarr, library, null),
  );
}

/**
 * "New releases from artists in your library" — same generator, filtered to
 * release-date within the last 18 months. The cutoff is chosen to be wide
 * enough to catch quietly-released albums users might have missed, but tight
 * enough that the row doesn't degrade into a generic discography.
 */
export async function getNewReleasesFromLibraryArtists(
  userId: string,
  lidarr: LidarrConfig | null,
  library: LibraryIndex,
): Promise<PersonalizedAlbum[]> {
  if (!lidarr) return [];

  return withCache(
    `personalized:v1:new-releases-library:${userId}`,
    CACHE_TTL_SECONDS,
    () => {
      const cutoff = new Date(Date.now() - NEW_RELEASE_WINDOW_MS);
      return fetchUnownedAlbumsForLibraryArtists(lidarr, library, cutoff);
    },
  );
}

async function fetchUnownedAlbumsForLibraryArtists(
  lidarr: LidarrConfig,
  library: LibraryIndex,
  releasedAfter: Date | null,
): Promise<PersonalizedAlbum[]> {
  const artists = await topLibraryArtists(lidarr, 5);
  if (artists.length === 0) return [];

  const perArtistAlbums = await Promise.all(
    artists.map(async (a) => {
      const detail = await getMbArtist(a.mbid);
      if (!detail) return [] as PersonalizedAlbum[];
      const filtered = detail.releaseGroups
        .filter((rg) => {
          if (rg.primaryType !== "Album") return false;
          if (rg.secondaryTypes.length > 0) return false;
          if (releasedAfter && rg.firstReleaseDate) {
            const d = new Date(rg.firstReleaseDate);
            if (Number.isNaN(d.getTime()) || d < releasedAfter) return false;
          } else if (releasedAfter && !rg.firstReleaseDate) {
            return false;
          }
          if (
            library.lookup({
              mbid: rg.mbid,
              artistName: a.name,
              title: rg.title,
            })
          ) {
            return false;
          }
          return true;
        })
        .slice(0, 5);
      return filtered.map<PersonalizedAlbum>((rg) => ({
        mbid: rg.mbid,
        title: rg.title,
        artistName: a.name,
        coverUrl: rg.coverUrl ?? coverUrlForReleaseGroup(rg.mbid),
      }));
    }),
  );

  const out: PersonalizedAlbum[] = [];
  let i = 0;
  while (out.length < ROW_LIMIT) {
    let added = false;
    for (const list of perArtistAlbums) {
      if (i < list.length) {
        out.push(list[i]!);
        added = true;
        if (out.length >= ROW_LIMIT) break;
      }
    }
    if (!added) break;
    i += 1;
  }
  return out;
}

/**
 * Hero "Recommended for you" row — interleaves the three reason rows, deduped
 * by `(artistName, albumMbid)`. Doesn't re-call any APIs; assumes the caller
 * already has the three rows resolved (so the cache layer is shared).
 */
export function blendRecommendedForYou(rows: {
  similar: PersonalizedAlbum[];
  more: PersonalizedAlbum[];
  newReleases: PersonalizedAlbum[];
}): PersonalizedAlbum[] {
  const seen = new Set<string>();
  const out: PersonalizedAlbum[] = [];
  const queues = [rows.similar, rows.more, rows.newReleases];
  let i = 0;
  while (out.length < ROW_LIMIT) {
    let added = false;
    for (const q of queues) {
      if (i < q.length) {
        const a = q[i]!;
        const key = `${a.artistName.toLowerCase()}|${a.mbid ?? a.title.toLowerCase()}`;
        if (!seen.has(key)) {
          seen.add(key);
          out.push(a);
          if (out.length >= ROW_LIMIT) break;
        }
        added = true;
      }
    }
    if (!added) break;
    i += 1;
  }
  return out;
}
