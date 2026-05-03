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
  position: number;
  title: string;
  /** Length in milliseconds, when MB provides it. */
  lengthMs: number | null;
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

async function mbFetch<T>(path: string, search: Record<string, string>): Promise<T> {
  const params = new URLSearchParams({ ...search, fmt: "json" });
  const url = `${MB_BASE}${path}?${params.toString()}`;
  await limiter.wait();
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`MusicBrainz ${path} → HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

function coverUrl(mbid: string): string {
  return `https://coverartarchive.org/release-group/${mbid}/front-250`;
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
  const cacheKey = `mb:rg:detail:${mbid}`;
  return withCache<MbAlbumDetail | null>(cacheKey, 7 * 24 * 60 * 60, async () => {
    let rg: MbReleaseGroupDetail;
    try {
      rg = await mbFetch<MbReleaseGroupDetail>(`/release-group/${mbid}`, {
        inc: "releases artist-credits",
      });
    } catch {
      return null;
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
        tracks = (rel.media ?? []).flatMap((m, mi) =>
          (m.tracks ?? []).map((t) => ({
            position: t.position ?? mi + 1,
            title: t.title,
            lengthMs: typeof t.length === "number" ? t.length : null,
          })),
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
