// Daily Mix & Discover Weekly — taste-based mixes for the discover page.
//
// Daily Mix is 70% familiar (the viewer's own DownloadedTrack library, weighted
// by plays/likes) + 30% new (tracks close to taste, not yet owned). Discover
// Weekly is 100% new, drawn from artists similar to taste that the viewer has
// never played. Both are *discovery* surfaces — nothing is auto-downloaded; the
// new rows carry a 30s Deezer preview and a Request button.
//
// A generated mix is cached in ApiCache (via withCache) keyed by user + period,
// so the first page view of the day/week generates it and the rest read cache.
// All shuffles run off a period+user-seeded PRNG so a mix is stable within its
// period even on a cache miss.

import { withCache } from "@/lib/cache";
import { prisma } from "@/lib/db";
import {
  getDeezerArtistBundle,
  getDeezerChartTracks,
  getDeezerNewReleaseTracks,
  normalizeTrackTitle,
  type DiscoveryTrack,
} from "@/lib/deezer";
import { getAllLikes } from "@/lib/likes";
import { isAdmin, type LibraryViewer } from "@/lib/userLibrary";

export type MixKind = "daily" | "weekly";

const DAILY_SIZE = 30;
const WEEKLY_SIZE = 30;
const DAILY_FAMILIAR = Math.round(DAILY_SIZE * 0.7); // 21; the rest (~30%) is new

// How many taste seed artists to expand, and how many similar artists to pull
// for Discover Weekly. Each getDeezerArtistBundle call is cached 7d, so these
// bound only the cost of the first generation in a period.
const SEED_ARTIST_LIMIT = 6;
const WEEKLY_SIMILAR_LIMIT = 15;
const WEEKLY_TRACKS_PER_ARTIST = 2;
// Hard cap on how many tracks any one artist can contribute to a mix's "new"
// pool. Robustly defends against a single prolific cover/karaoke artist (Deezer
// genre charts are riddled with them) flooding the mix.
const MAX_PER_ARTIST = 2;
// Looser cap for the familiar (library) portion of Daily Mix — taste-driven but
// still varied, so a heavily-played artist doesn't dominate.
const FAMILIAR_MAX_PER_ARTIST = 3;

/**
 * A track in a generated mix. `library` tracks stream in full and scrobble;
 * `new` tracks are DiscoveryTrack-shaped so they reuse the discover preview +
 * request flow.
 */
export type MixTrack =
  | {
      kind: "library";
      title: string;
      artistName: string;
      albumTitle: string | null;
      coverUrl: string | null;
      durationMs: number | null;
      downloadedTrackId: string;
      recordingMbid: string | null;
      albumMbid: string;
      albumPosition: number;
    }
  | {
      kind: "new";
      title: string;
      artistName: string;
      albumTitle: string | null;
      coverUrl: string | null;
      durationMs: number | null;
      previewUrl: string | null;
    };

export type GeneratedMix = {
  kind: MixKind;
  periodKey: string;
  title: string;
  subtitle: string;
  /** Up to 4 distinct track covers for a 2x2 mosaic. */
  coverUrls: string[];
  tracks: MixTrack[];
};

// ---------------------------------------------------------------------------
// Deterministic shuffle (mulberry32 PRNG seeded from a string hash)
// ---------------------------------------------------------------------------

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededShuffle<T>(items: T[], seed: string): T[] {
  const rng = mulberry32(hashSeed(seed));
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Period keys + TTL
// ---------------------------------------------------------------------------

function dailyPeriodKey(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function isoWeekPeriodKey(now: Date): string {
  // ISO week date: Thursday of the current week determines the week-year.
  const d = new Date(
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()),
  );
  const day = d.getUTCDay() || 7; // Mon=1..Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function secondsUntilEndOfDay(now: Date): number {
  const end = new Date(now);
  end.setHours(24, 0, 0, 0);
  return Math.max(60, Math.ceil((end.getTime() - now.getTime()) / 1000));
}

function secondsUntilEndOfWeek(now: Date): number {
  // ISO week ends at the start of next Monday (local time).
  const end = new Date(now);
  const day = end.getDay() || 7; // Mon=1..Sun=7
  end.setHours(0, 0, 0, 0);
  end.setDate(end.getDate() + (8 - day));
  return Math.max(60, Math.ceil((end.getTime() - now.getTime()) / 1000));
}

// ---------------------------------------------------------------------------
// Taste profile
// ---------------------------------------------------------------------------

type OwnedTrack = {
  id: string;
  title: string;
  artistName: string;
  albumTitle: string | null;
  albumMbid: string;
  albumPosition: number;
  coverUrl: string | null;
  durationMs: number | null;
  recordingMbid: string | null;
};

async function getOwnedTracks(viewer: LibraryViewer): Promise<OwnedTrack[]> {
  if (!viewer) return [];
  return prisma.downloadedTrack.findMany({
    // Real library only — pre-downloaded temp tracks must not count as
    // "familiar" or get excluded from the mix's "new" pool.
    where: {
      ephemeral: false,
      ...(isAdmin(viewer) ? {} : { users: { some: { userId: viewer.id } } }),
    },
    select: {
      id: true,
      title: true,
      artistName: true,
      albumTitle: true,
      albumMbid: true,
      albumPosition: true,
      coverUrl: true,
      durationMs: true,
      recordingMbid: true,
    },
  });
}

type TasteProfile = {
  /** Seed artist names, strongest first. */
  seedArtists: string[];
  /** Play count keyed by PlayHistory.recordingMbid. */
  playsByRecording: Map<string, number>;
  /** Play count keyed by PlayHistory.albumMbid. */
  playsByAlbum: Map<string, number>;
  /** Normalized names of artists the viewer has played or owns. */
  knownArtists: Set<string>;
  likedRecordings: Set<string>;
  likedAlbums: Set<string>;
  likedArtists: Set<string>;
};

async function buildTasteProfile(
  userId: string,
  owned: OwnedTrack[],
): Promise<TasteProfile> {
  const [playedArtists, recGroups, albumGroups, likes] = await Promise.all([
    prisma.playHistory.groupBy({
      by: ["artistName"],
      where: { userId },
      _count: { _all: true },
      orderBy: { _count: { artistName: "desc" } },
      take: 40,
    }),
    prisma.playHistory.groupBy({
      by: ["recordingMbid"],
      where: { userId },
      _count: { _all: true },
    }),
    prisma.playHistory.groupBy({
      by: ["albumMbid"],
      where: { userId, albumMbid: { not: null } },
      _count: { _all: true },
    }),
    getAllLikes(userId),
  ]);

  const playsByRecording = new Map<string, number>();
  for (const g of recGroups) playsByRecording.set(g.recordingMbid, g._count._all);
  const playsByAlbum = new Map<string, number>();
  for (const g of albumGroups) {
    if (g.albumMbid) playsByAlbum.set(g.albumMbid, g._count._all);
  }

  const likedRecordings = new Set<string>();
  const likedAlbums = new Set<string>();
  const likedArtists = new Set<string>();
  const likeArtistRank = new Map<string, number>();
  for (const l of likes) {
    if (l.targetType === "TRACK") likedRecordings.add(l.targetId);
    else if (l.targetType === "ALBUM") likedAlbums.add(l.targetId);
    else if (l.targetType === "ARTIST") likedArtists.add(l.targetId);
    if (l.artistName) {
      const key = normalizeTrackTitle(l.artistName);
      // Likes weigh heavier than plays as a seed signal.
      likeArtistRank.set(key, (likeArtistRank.get(key) ?? 0) + 5);
    }
  }

  // Combine play counts and like weights into a single ranked seed list,
  // preserving the (display) artist name we first saw for each.
  const score = new Map<string, number>();
  const displayName = new Map<string, string>();
  const note = (name: string, weight: number) => {
    const key = normalizeTrackTitle(name);
    if (!key) return;
    score.set(key, (score.get(key) ?? 0) + weight);
    if (!displayName.has(key)) displayName.set(key, name);
  };
  for (const g of playedArtists) note(g.artistName, g._count._all);
  for (const l of likes) if (l.artistName) note(l.artistName, 5);

  const knownArtists = new Set<string>();
  for (const g of playedArtists) knownArtists.add(normalizeTrackTitle(g.artistName));
  for (const t of owned) knownArtists.add(normalizeTrackTitle(t.artistName));

  const seedArtists = [...score.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([key]) => displayName.get(key)!)
    .filter(Boolean);

  return {
    seedArtists,
    playsByRecording,
    playsByAlbum,
    knownArtists,
    likedRecordings,
    likedAlbums,
    likedArtists,
  };
}

// ---------------------------------------------------------------------------
// Familiar pool (Daily Mix, 70%)
// ---------------------------------------------------------------------------

function scoreOwnedTrack(t: OwnedTrack, p: TasteProfile): number {
  let s = 1; // baseline so every owned track is eligible
  const rec = t.recordingMbid ? p.playsByRecording.get(t.recordingMbid) ?? 0 : 0;
  const localRec = p.playsByRecording.get(`local:${t.id}`) ?? 0;
  s += (rec + localRec) * 3;
  s += p.playsByAlbum.get(t.albumMbid) ?? 0;
  if (t.recordingMbid && p.likedRecordings.has(t.recordingMbid)) s += 5;
  if (p.likedAlbums.has(t.albumMbid)) s += 3;
  if (p.likedArtists.has(normalizeTrackTitle(t.artistName))) s += 2;
  return s;
}

function ownedToMixTrack(t: OwnedTrack): MixTrack {
  return {
    kind: "library",
    title: t.title,
    artistName: t.artistName,
    albumTitle: t.albumTitle,
    coverUrl: t.coverUrl,
    durationMs: t.durationMs,
    downloadedTrackId: t.id,
    recordingMbid: t.recordingMbid,
    albumMbid: t.albumMbid,
    albumPosition: t.albumPosition,
  };
}

function pickFamiliar(
  owned: OwnedTrack[],
  profile: TasteProfile,
  count: number,
  seed: string,
): MixTrack[] {
  if (owned.length === 0 || count <= 0) return [];
  // Keep only each artist's strongest few so a heavily-played artist can't fill
  // the whole mix — a Daily Mix should feel varied, not like one artist's page.
  const byArtist = new Map<string, { t: OwnedTrack; score: number }[]>();
  for (const t of owned) {
    const key = normalizeTrackTitle(t.artistName);
    const arr = byArtist.get(key) ?? [];
    arr.push({ t, score: scoreOwnedTrack(t, profile) });
    byArtist.set(key, arr);
  }
  const candidates: { t: OwnedTrack; score: number }[] = [];
  for (const arr of byArtist.values()) {
    arr.sort((a, b) => b.score - a.score);
    candidates.push(...arr.slice(0, FAMILIAR_MAX_PER_ARTIST));
  }
  candidates.sort((a, b) => b.score - a.score);
  // Top candidates by score, then shuffle for day-to-day rotation.
  const window = candidates.slice(
    0,
    Math.max(count, Math.min(count * 2, candidates.length)),
  );
  return seededShuffle(window, seed)
    .slice(0, count)
    .map(({ t }) => ownedToMixTrack(t));
}

// ---------------------------------------------------------------------------
// New pool (Daily Mix 30%, Discover Weekly 100%)
// ---------------------------------------------------------------------------

function discoveryToMixTrack(d: DiscoveryTrack): MixTrack {
  return {
    kind: "new",
    title: d.title,
    artistName: d.artistName,
    albumTitle: d.albumTitle,
    coverUrl: d.coverUrl,
    durationMs: d.durationMs,
    previewUrl: d.previewUrl,
  };
}

function trackExclusionKey(artist: string, title: string): string {
  return `${normalizeTrackTitle(artist)}|${normalizeTrackTitle(title)}`;
}

/** Pull an artist's Deezer top tracks as DiscoveryTracks (artist name attached). */
async function artistTopDiscoveryTracks(
  artistName: string,
): Promise<DiscoveryTrack[]> {
  const bundle = await getDeezerArtistBundle(artistName, 10, WEEKLY_SIMILAR_LIMIT);
  if (!bundle) return [];
  return bundle.topTracks.map((t) => ({
    title: t.title,
    artistName,
    albumTitle: t.albumTitle,
    coverUrl: t.albumCover,
    previewUrl: t.previewUrl,
    durationMs: t.durationMs,
  }));
}

function dedupeNew(
  tracks: DiscoveryTrack[],
  excludeTrackKeys: Set<string>,
): DiscoveryTrack[] {
  const seen = new Set<string>();
  const out: DiscoveryTrack[] = [];
  for (const t of tracks) {
    const key = trackExclusionKey(t.artistName, t.title);
    if (excludeTrackKeys.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

/** No single artist may exceed `max` tracks (order-preserving). */
function capPerArtist(tracks: DiscoveryTrack[], max: number): DiscoveryTrack[] {
  const counts = new Map<string, number>();
  const out: DiscoveryTrack[] = [];
  for (const t of tracks) {
    const key = normalizeTrackTitle(t.artistName);
    const n = counts.get(key) ?? 0;
    if (n >= max) continue;
    counts.set(key, n + 1);
    out.push(t);
  }
  return out;
}

// Clean keyless fallback when taste is thin or a taste pool comes up short.
// Deliberately avoids genre charts (Deezer's /chart/<genre> feeds are polluted
// with karaoke/cover compilations); the global chart and editorial releases are
// reliably real artists.
async function coldStartNew(seed: string): Promise<DiscoveryTrack[]> {
  const [global, fresh] = await Promise.all([
    getDeezerChartTracks(null, 50).catch(() => []),
    getDeezerNewReleaseTracks(25).catch(() => []),
  ]);
  return seededShuffle(dedupeNew([...global, ...fresh], new Set()), seed);
}

/**
 * Turn a taste-derived candidate pool into the final `count` new tracks: taste
 * picks first (capped per artist), topped up with clean-chart filler only if
 * short, then deduped and re-capped so no artist dominates.
 */
async function finalizeNewPool(
  tastePool: DiscoveryTrack[],
  excludeTrackKeys: Set<string>,
  count: number,
  seed: string,
): Promise<MixTrack[]> {
  let result = capPerArtist(
    seededShuffle(dedupeNew(tastePool, excludeTrackKeys), seed),
    MAX_PER_ARTIST,
  );
  if (result.length < count) {
    const filler = await coldStartNew(`${seed}:filler`);
    result = capPerArtist(
      dedupeNew([...result, ...filler], excludeTrackKeys),
      MAX_PER_ARTIST,
    );
  }
  return result.slice(0, count).map(discoveryToMixTrack);
}

async function pickDailyNew(
  profile: TasteProfile,
  excludeTrackKeys: Set<string>,
  count: number,
  seed: string,
): Promise<MixTrack[]> {
  if (count <= 0) return [];
  const seeds = profile.seedArtists.slice(0, SEED_ARTIST_LIMIT);
  let pool: DiscoveryTrack[] = [];
  if (seeds.length > 0) {
    const results = await Promise.allSettled(
      seeds.map((a) => artistTopDiscoveryTracks(a)),
    );
    pool = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  }
  return finalizeNewPool(pool, excludeTrackKeys, count, seed);
}

async function pickWeeklyNew(
  profile: TasteProfile,
  excludeTrackKeys: Set<string>,
  count: number,
  seed: string,
): Promise<MixTrack[]> {
  const seeds = profile.seedArtists.slice(0, SEED_ARTIST_LIMIT);
  let pool: DiscoveryTrack[] = [];

  if (seeds.length > 0) {
    // Expand seeds → similar artists the viewer has never played.
    const bundles = await Promise.allSettled(
      seeds.map((a) => getDeezerArtistBundle(a, 5, WEEKLY_SIMILAR_LIMIT)),
    );
    const similarNames: string[] = [];
    const seenSimilar = new Set<string>();
    for (const b of bundles) {
      if (b.status !== "fulfilled" || !b.value) continue;
      for (const s of b.value.similar) {
        const key = normalizeTrackTitle(s.name);
        if (!key || seenSimilar.has(key) || profile.knownArtists.has(key)) continue;
        seenSimilar.add(key);
        similarNames.push(s.name);
      }
    }
    const chosen = seededShuffle(similarNames, seed).slice(0, WEEKLY_SIMILAR_LIMIT);
    const topResults = await Promise.allSettled(
      chosen.map((a) => artistTopDiscoveryTracks(a)),
    );
    pool = topResults.flatMap((r) =>
      r.status === "fulfilled"
        ? seededShuffle(r.value, `${seed}:${r.value[0]?.artistName ?? ""}`).slice(
            0,
            WEEKLY_TRACKS_PER_ARTIST,
          )
        : [],
    );
  }

  return finalizeNewPool(pool, excludeTrackKeys, count, seed);
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

/** Interleave familiar + new so the mix reads as one list, not two blocks. */
function interleave(familiar: MixTrack[], fresh: MixTrack[]): MixTrack[] {
  const total = familiar.length + fresh.length;
  if (fresh.length === 0) return familiar;
  if (familiar.length === 0) return fresh;
  const out: MixTrack[] = [];
  let fi = 0;
  let ni = 0;
  // Spread the smaller set evenly across the larger one.
  const step = total / fresh.length;
  let nextNew = step / 2;
  for (let i = 0; i < total; i++) {
    if (ni < fresh.length && i >= nextNew - 0.5) {
      out.push(fresh[ni++]);
      nextNew += step;
    } else if (fi < familiar.length) {
      out.push(familiar[fi++]);
    } else if (ni < fresh.length) {
      out.push(fresh[ni++]);
    }
  }
  return out;
}

function pickCoverUrls(tracks: MixTrack[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of tracks) {
    if (!t.coverUrl || seen.has(t.coverUrl)) continue;
    seen.add(t.coverUrl);
    out.push(t.coverUrl);
    if (out.length === 4) break;
  }
  return out;
}

function buildExclusionKeys(owned: OwnedTrack[]): Set<string> {
  const keys = new Set<string>();
  for (const t of owned) keys.add(trackExclusionKey(t.artistName, t.title));
  return keys;
}

async function generateMix(
  viewer: LibraryViewer,
  kind: MixKind,
  periodKey: string,
): Promise<GeneratedMix> {
  const userId = viewer!.id;
  const seed = `${kind}:${userId}:${periodKey}`;
  const owned = await getOwnedTracks(viewer);
  const profile = await buildTasteProfile(userId, owned);
  const exclude = buildExclusionKeys(owned);

  let tracks: MixTrack[];
  if (kind === "daily") {
    const familiar = pickFamiliar(owned, profile, DAILY_FAMILIAR, seed);
    // If the library can't fill the familiar 70%, make up the rest with new.
    const newCount = DAILY_SIZE - familiar.length;
    const fresh = await pickDailyNew(profile, exclude, newCount, seed);
    tracks = interleave(familiar, fresh);
  } else {
    tracks = await pickWeeklyNew(profile, exclude, WEEKLY_SIZE, seed);
  }

  return {
    kind,
    periodKey,
    title: kind === "daily" ? "Daily Mix" : "Discover Weekly",
    subtitle:
      kind === "daily"
        ? "Made for you · refreshes daily"
        : "Brand-new finds · refreshes Monday",
    coverUrls: pickCoverUrls(tracks),
    tracks,
  };
}

/**
 * The cached entry point. Generates the mix for the current period on first
 * access, then serves it from ApiCache until the period rolls over.
 */
export async function getOrGenerateMix(
  viewer: LibraryViewer,
  kind: MixKind,
): Promise<GeneratedMix> {
  if (!viewer) {
    return {
      kind,
      periodKey: "anon",
      title: kind === "daily" ? "Daily Mix" : "Discover Weekly",
      subtitle: "",
      coverUrls: [],
      tracks: [],
    };
  }
  const now = new Date();
  const periodKey = kind === "daily" ? dailyPeriodKey(now) : isoWeekPeriodKey(now);
  const ttl =
    kind === "daily" ? secondsUntilEndOfDay(now) : secondsUntilEndOfWeek(now);
  const cacheKey = `mix:${kind}:${viewer.id}:${periodKey}`;
  return withCache<GeneratedMix>(cacheKey, ttl, () =>
    generateMix(viewer, kind, periodKey),
  );
}
