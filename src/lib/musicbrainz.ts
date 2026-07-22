// MusicBrainz client. Strict 1 req/sec, requires a User-Agent string.
// Results cached in ApiCache to absorb retries and shared queries (design doc §10).

import { withCache } from "@/lib/cache";
import { makeRateLimiter } from "@/lib/rate-limit";

const MB_BASE = "https://musicbrainz.org/ws/2";
const USER_AGENT = "Audioseerr/0.1.0 ( https://github.com/audioseerr )";

const limiter = makeRateLimiter(1);

export type MbAlbum = {
  mbid: string;
  title: string;
  artistName: string;
  artistMbid: string | null;
  firstReleaseDate: string | null;
  primaryType: string | null;
  coverUrl: string;
};

export type MbTrack = {
  /** 1-indexed track number within its disc. */
  position: number;
  /** 1-indexed disc number. */
  mediumNumber: number;
  /** 1-indexed track number across the whole release (counting through all
   * discs). Used as the join key against Lidarr's track files because MB and
   * Lidarr sometimes model the same release with different disc structures. */
  absolutePosition: number;
  title: string;
  /** Length in milliseconds, when MB provides it. */
  lengthMs: number | null;
  /**
   * Recording-level MBID (stable across reissues — preferred over the
   * release-specific track MBID). Null when MB omits the recording sub-object.
   */
  recordingMbid: string | null;
};

export type MbAlbumDetail = MbAlbum & {
  /** MBID of the chosen release whose tracklist we surfaced. */
  releaseMbid: string;
  tracks: MbTrack[];
};

export type MbReleaseGroupSummary = {
  mbid: string;
  title: string;
  primaryType: string | null;
  secondaryTypes: string[];
  firstReleaseDate: string | null;
  coverUrl: string;
};

export type MbArtist = {
  mbid: string;
  name: string;
  /** "Person" | "Group" | "Orchestra" | "Choir" | "Character" | "Other" | null */
  type: string | null;
  country: string | null;
  lifeBegin: string | null;
  lifeEnd: string | null;
  ended: boolean;
  releaseGroups: MbReleaseGroupSummary[];
};

type MbReleaseGroupSearchResponse = {
  "release-groups": Array<{
    id: string;
    title: string;
    "primary-type"?: string;
    "first-release-date"?: string;
    "artist-credit"?: Array<{
      name?: string;
      artist?: { id?: string; name?: string };
    }>;
  }>;
  count?: number;
};

type MbArtistSearchResponse = {
  artists: Array<{
    id: string;
    name: string;
    type?: string;
    country?: string;
    score?: number;
  }>;
  count?: number;
};

export type MbArtistSearchHit = {
  mbid: string;
  name: string;
  type: string | null;
  country: string | null;
  score: number;
};

class MbHttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function mbFetch<T>(path: string, search: Record<string, string>): Promise<T> {
  const params = new URLSearchParams({ ...search, fmt: "json" });
  const url = `${MB_BASE}${path}?${params.toString()}`;
  await limiter.wait();
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  if (!res.ok) {
    throw new MbHttpError(res.status, `MusicBrainz ${path} → HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

// Last.fm's tag.gettopalbums often returns *release* MBIDs in the `mbid` field
// rather than release-group MBIDs, so /release-group/{id} 404s. Resolve to the
// owning release group so callers can keep working with one canonical id.
async function resolveReleaseToReleaseGroup(mbid: string): Promise<string | null> {
  try {
    const rel = await mbFetch<{ "release-group"?: { id?: string } }>(
      `/release/${mbid}`,
      { inc: "release-groups" },
    );
    return rel["release-group"]?.id ?? null;
  } catch {
    return null;
  }
}

function coverUrl(mbid: string): string {
  return `https://coverartarchive.org/release-group/${mbid}/front-250`;
}

export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function joinArtistCredit(
  credit?: MbReleaseGroupSearchResponse["release-groups"][number]["artist-credit"],
): { name: string; mbid: string | null } {
  if (!credit || credit.length === 0) return { name: "Unknown artist", mbid: null };
  const name = credit
    .map((c) => c.name ?? c.artist?.name ?? "")
    .filter(Boolean)
    .join(" / ");
  return {
    name: name || "Unknown artist",
    mbid: credit[0]?.artist?.id ?? null,
  };
}

type MbReleaseGroupDetail = {
  id: string;
  title: string;
  "primary-type"?: string;
  "first-release-date"?: string;
  "artist-credit"?: MbReleaseGroupSearchResponse["release-groups"][number]["artist-credit"];
  releases?: Array<{
    id: string;
    title?: string;
    status?: string;
    date?: string;
    country?: string;
    "track-count"?: number;
  }>;
};

type MbReleaseDetail = {
  id: string;
  title: string;
  date?: string;
  media?: Array<{
    "track-count"?: number;
    tracks?: Array<{
      id: string;
      position?: number;
      number?: string;
      title: string;
      length?: number;
      recording?: { id: string; title?: string; length?: number };
    }>;
  }>;
};

function pickPreferredRelease(
  releases: NonNullable<MbReleaseGroupDetail["releases"]>,
): NonNullable<MbReleaseGroupDetail["releases"]>[number] | null {
  if (releases.length === 0) return null;
  const score = (r: (typeof releases)[number]): number => {
    let s = 0;
    if (r.status === "Official") s += 10;
    if (r.country === "XW" || r.country === "US" || r.country === "GB") s += 5;
    s += Math.min(r["track-count"] ?? 0, 30) / 30;
    return s;
  };
  return [...releases].sort((a, b) => score(b) - score(a))[0]!;
}

export async function getAlbum(mbid: string): Promise<MbAlbumDetail | null> {
  // v4 — absolutePosition added to MbTrack (multi-disc disambiguation)
  const cacheKey = `mb:rg:detail:v4:${mbid}`;
  return withCache<MbAlbumDetail | null>(cacheKey, 7 * 24 * 60 * 60, async () => {
    let rg: MbReleaseGroupDetail;
    try {
      rg = await mbFetch<MbReleaseGroupDetail>(`/release-group/${mbid}`, {
        inc: "releases artist-credits",
      });
    } catch (e) {
      // Last.fm sometimes hands us a release MBID instead of a release-group
      // MBID. Try resolving and re-fetching once before giving up.
      if (e instanceof MbHttpError && e.status === 404) {
        const rgMbid = await resolveReleaseToReleaseGroup(mbid);
        if (!rgMbid) return null;
        try {
          rg = await mbFetch<MbReleaseGroupDetail>(`/release-group/${rgMbid}`, {
            inc: "releases artist-credits",
          });
        } catch {
          return null;
        }
      } else {
        return null;
      }
    }

    const release = pickPreferredRelease(rg.releases ?? []);
    let tracks: MbTrack[] = [];
    let releaseMbid = "";

    if (release) {
      releaseMbid = release.id;
      try {
        const rel = await mbFetch<MbReleaseDetail>(`/release/${release.id}`, {
          inc: "recordings",
        });
        let absolute = 0;
        tracks = (rel.media ?? []).flatMap((m, mi) =>
          (m.tracks ?? []).map((t) => {
            absolute += 1;
            return {
              position: t.position ?? mi + 1,
              mediumNumber: mi + 1,
              absolutePosition: absolute,
              title: t.title,
              lengthMs: typeof t.length === "number" ? t.length : null,
              recordingMbid: t.recording?.id ?? null,
            };
          }),
        );
      } catch {
        // tracks remain empty; the page still renders the hero
      }
    }

    const credit = joinArtistCredit(rg["artist-credit"]);
    return {
      mbid: rg.id,
      title: rg.title,
      artistName: credit.name,
      artistMbid: credit.mbid,
      firstReleaseDate: rg["first-release-date"] ?? null,
      primaryType: rg["primary-type"] ?? null,
      coverUrl: coverUrl(rg.id),
      releaseMbid,
      tracks,
    };
  });
}

type MbArtistDetailResponse = {
  id: string;
  name: string;
  type?: string;
  country?: string;
  "life-span"?: { begin?: string; end?: string; ended?: boolean };
  "release-groups"?: Array<{
    id: string;
    title: string;
    "primary-type"?: string;
    "secondary-types"?: string[];
    "first-release-date"?: string;
  }>;
};

export async function getArtist(mbid: string): Promise<MbArtist | null> {
  const cacheKey = `mb:artist:detail:${mbid}`;
  return withCache<MbArtist | null>(cacheKey, 24 * 60 * 60, async () => {
    let data: MbArtistDetailResponse;
    try {
      data = await mbFetch<MbArtistDetailResponse>(`/artist/${mbid}`, {
        inc: "release-groups",
      });
    } catch {
      return null;
    }

    const lifeSpan = data["life-span"] ?? {};
    const groups = (data["release-groups"] ?? [])
      .map<MbReleaseGroupSummary>((rg) => ({
        mbid: rg.id,
        title: rg.title,
        primaryType: rg["primary-type"] ?? null,
        secondaryTypes: rg["secondary-types"] ?? [],
        firstReleaseDate: rg["first-release-date"] ?? null,
        coverUrl: coverUrl(rg.id),
      }))
      // Most-recent first within each type. Sort secondary at the page level.
      .sort((a, b) => (b.firstReleaseDate ?? "").localeCompare(a.firstReleaseDate ?? ""));

    return {
      mbid: data.id,
      name: data.name,
      type: data.type ?? null,
      country: data.country ?? null,
      lifeBegin: lifeSpan.begin ?? null,
      lifeEnd: lifeSpan.end ?? null,
      ended: lifeSpan.ended ?? false,
      releaseGroups: groups,
    };
  });
}

export async function searchAlbums(query: string, limit = 25): Promise<MbAlbum[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const cacheKey = `mb:search:rg:${limit}:${trimmed.toLowerCase()}`;
  return withCache<MbAlbum[]>(cacheKey, 60 * 60, async () => {
    // primarytype:Album|EP keeps the noisier release types out of v1 search.
    const data = await mbFetch<MbReleaseGroupSearchResponse>("/release-group", {
      query: `${trimmed} AND primarytype:(Album OR EP)`,
      limit: String(limit),
    });

    return data["release-groups"].map((rg) => {
      const credit = joinArtistCredit(rg["artist-credit"]);
      return {
        mbid: rg.id,
        title: rg.title,
        artistName: credit.name,
        artistMbid: credit.mbid,
        firstReleaseDate: rg["first-release-date"] ?? null,
        primaryType: rg["primary-type"] ?? null,
        coverUrl: coverUrl(rg.id),
      };
    });
  });
}

// Field-qualified album lookup for "I know the artist + title, give me the
// MBID" cases (e.g. resolving a Deezer chart card). Free-text searchAlbums
// blindly trusts MB's relevance ranking, which can rank a different album
// above the right one when the title is a common phrase like "Greatest Hits".
export async function findAlbumByArtistTitle(
  artist: string,
  title: string,
  opts?: { includeSingles?: boolean },
): Promise<MbAlbum | null> {
  const a = artist.trim();
  const t = title.trim();
  if (!a || !t) return null;

  const escape = (s: string) => s.replace(/(["\\])/g, "\\$1");
  // Constrain artist (phrase match), but leave the title as free text so
  // suffixes like "(Remastered)" that aren't in MB's release-group title
  // still find their parent release group. Discover passes includeSingles so a
  // charting single (its own release-group, primary type Single) still resolves.
  const titleTerms = t.replace(/[()[\]{}"\\]/g, " ").trim();
  const types = opts?.includeSingles ? "Album OR EP OR Single" : "Album OR EP";
  const lucene = `artist:"${escape(a)}" AND (${titleTerms}) AND primarytype:(${types})`;
  const cacheKey = `mb:resolve:rg:v2:${opts?.includeSingles ? "s:" : ""}${a.toLowerCase()}|${t.toLowerCase()}`;

  return withCache<MbAlbum | null>(cacheKey, 60 * 60, async () => {
    const data = await mbFetch<MbReleaseGroupSearchResponse>("/release-group", {
      query: lucene,
      limit: "10",
    });
    const wantArtist = normalizeName(a);
    const wantTitle = normalizeName(t);
    const candidates = data["release-groups"].map((rg) => {
      const credit = joinArtistCredit(rg["artist-credit"]);
      return {
        mbid: rg.id,
        title: rg.title,
        artistName: credit.name,
        artistMbid: credit.mbid,
        firstReleaseDate: rg["first-release-date"] ?? null,
        primaryType: rg["primary-type"] ?? null,
        coverUrl: coverUrl(rg.id),
      };
    });
    // Require the artist to actually match — MB sometimes still returns
    // off-artist hits when the title is generic.
    const artistMatch = candidates.filter(
      (c) => normalizeName(c.artistName) === wantArtist,
    );
    if (artistMatch.length === 0) return null;
    const exact = artistMatch.find((c) => normalizeName(c.title) === wantTitle);
    return exact ?? artistMatch[0];
  });
}

export async function searchArtists(
  query: string,
  limit = 10,
): Promise<MbArtistSearchHit[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const cacheKey = `mb:search:artist:v2:${limit}:${trimmed.toLowerCase()}`;
  return withCache<MbArtistSearchHit[]>(cacheKey, 60 * 60, async () => {
    const data = await mbFetch<MbArtistSearchResponse>("/artist", {
      query: trimmed,
      limit: String(limit),
    });
    const want = normalizeName(trimmed);
    return data.artists
      .map((a) => ({
        mbid: a.id,
        name: a.name,
        type: a.type ?? null,
        country: a.country ?? null,
        score: typeof a.score === "number" ? a.score : 0,
      }))
      .sort((a, b) => {
        const exactA = normalizeName(a.name) === want ? 1 : 0;
        const exactB = normalizeName(b.name) === want ? 1 : 0;
        if (exactA !== exactB) return exactB - exactA;
        return b.score - a.score;
      });
  });
}

// Recent release groups for one artist, server-side date-filtered via the
// search API (`firstreleasedate` range). We use search instead of the
// /release-group?artist= browse endpoint because browse can't filter by date
// and isn't date-sorted — prolific artists have hundreds of release groups
// across dozens of pages, while the date-filtered search is ONE request per
// artist no matter the discography size. Search also returns artist-credit
// (browse doesn't), which keeps VA/collab artist names correct.
//
// `since` is a YYYY-MM-DD lower bound (day-quantized by the caller) and is
// part of the cache key, so each artist is fetched at most once per day even
// though the window slides.
export async function getRecentArtistAlbums(
  artistMbid: string,
  since: string,
  limit = 50,
): Promise<MbAlbum[]> {
  const cacheKey = `mb:rg:recent:v1:${artistMbid}:${since}:${limit}`;
  return withCache<MbAlbum[]>(cacheKey, 24 * 60 * 60, async () => {
    const data = await mbFetch<MbReleaseGroupSearchResponse>("/release-group", {
      query: `arid:${artistMbid} AND primarytype:Album AND firstreleasedate:[${since} TO *]`,
      limit: String(limit),
    });
    return data["release-groups"].map((rg) => {
      const credit = joinArtistCredit(rg["artist-credit"]);
      return {
        mbid: rg.id,
        title: rg.title,
        artistName: credit.name,
        artistMbid: credit.mbid,
        firstReleaseDate: rg["first-release-date"] ?? null,
        primaryType: rg["primary-type"] ?? null,
        coverUrl: coverUrl(rg.id),
      };
    });
  });
}

// Just the owning artist of a release group — the cheap way to answer
// "which artist is this album by?" without getAlbum's tracklist fetches.
// Cached long (30d): an album's artist essentially never changes.
export async function getAlbumArtist(
  releaseGroupMbid: string,
): Promise<{ mbid: string; name: string } | null> {
  const cacheKey = `mb:rg:artist:v1:${releaseGroupMbid}`;
  return withCache<{ mbid: string; name: string } | null>(
    cacheKey,
    30 * 24 * 60 * 60,
    async () => {
      try {
        const rg = await mbFetch<MbReleaseGroupDetail>(
          `/release-group/${releaseGroupMbid}`,
          { inc: "artist-credits" },
        );
        const credit = joinArtistCredit(rg["artist-credit"]);
        return credit.mbid ? { mbid: credit.mbid, name: credit.name } : null;
      } catch {
        return null;
      }
    },
  );
}
