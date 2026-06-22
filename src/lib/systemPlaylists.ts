// System (editorial) playlists — Spotify-style mood/genre playlists owned by no
// one, visible to everyone, refreshed weekly from Last.fm tags. Definitions live
// here as a code constant; seedSystemPlaylists() upserts them into Playlist rows
// (isSystem=true) by slug, and refreshSystemPlaylist() repopulates a row's tracks
// each week. The cron that drives the schedule is src/lib/jobs/refreshSystemPlaylists.

import { prisma } from "@/lib/db";
import { getGenreFallbackTracks } from "@/lib/genreFallbackTracks";
import { isoWeekPeriodKey, seededShuffle } from "@/lib/mixes";
import { resolveSong } from "@/lib/songResolve";

export type SystemPlaylistDef = {
  slug: string;
  name: string;
  description: string;
  // Last.fm tags the weekly refresh pulls top tracks from. Mixing a mood tag
  // with a genre tag keeps the pool broad enough that the week-seeded shuffle
  // has something to rotate through.
  tags: string[];
};

export const SYSTEM_PLAYLISTS: SystemPlaylistDef[] = [
  {
    slug: "good-morning-vibes",
    name: "Good Morning Vibes",
    description: "Easy, bright songs to start the day.",
    tags: ["morning", "chillout", "acoustic"],
  },
  {
    slug: "happy-mondays",
    name: "Happy Mondays",
    description: "Feel-good picks to beat the start-of-week slump.",
    tags: ["happy", "feel good", "indie pop"],
  },
  {
    slug: "gym-energy",
    name: "Gym Energy",
    description: "High-tempo tracks to push through your workout.",
    tags: ["workout", "gym", "power"],
  },
  {
    slug: "late-night-drive",
    name: "Late Night Drive",
    description: "Moody synths and slow burns for the empty road.",
    tags: ["night", "synthwave", "chillwave"],
  },
  {
    slug: "focus-flow",
    name: "Focus Flow",
    description: "Instrumental and ambient music to lock in.",
    tags: ["focus", "instrumental", "ambient"],
  },
  {
    slug: "rainy-day",
    name: "Rainy Day",
    description: "Mellow songs for grey skies.",
    tags: ["rainy day", "mellow", "sad"],
  },
  {
    slug: "throwback-party",
    name: "Throwback Party",
    description: "Decades of dancefloor classics.",
    tags: ["party", "80s", "dance"],
  },
  {
    slug: "coffeehouse-acoustic",
    name: "Coffeehouse Acoustic",
    description: "Warm acoustic and singer-songwriter cuts.",
    tags: ["acoustic", "singer-songwriter", "folk"],
  },
  {
    slug: "feel-good-pop",
    name: "Feel Good Pop",
    description: "Sunny, sing-along pop.",
    tags: ["pop", "happy", "summer"],
  },
  {
    slug: "chill-vibes",
    name: "Chill Vibes",
    description: "Laid-back downtempo for winding down.",
    tags: ["chillout", "chill", "downtempo"],
  },
  {
    slug: "indie-discoveries",
    name: "Indie Discoveries",
    description: "Fresh indie and alternative finds.",
    tags: ["indie", "indie rock", "alternative"],
  },
  {
    slug: "hip-hop-heat",
    name: "Hip-Hop Heat",
    description: "Hard-hitting rap and trap.",
    tags: ["hip-hop", "rap", "trap"],
  },
  {
    slug: "rock-anthems",
    name: "Rock Anthems",
    description: "Big riffs and bigger choruses.",
    tags: ["classic rock", "rock", "hard rock"],
  },
  {
    slug: "soulful-sunday",
    name: "Soulful Sunday",
    description: "Soul, R&B and neo-soul to ease into the week.",
    tags: ["soul", "r&b", "neo-soul"],
  },
];

const TARGET_TRACKS = 28;
const POOL_PER_TAG = 50;
// Resolving a candidate to MusicBrainz is the expensive step (rate-limited MB
// lookups). Cap attempts so one playlist's refresh can't hammer MB chasing a
// thin pool — we accept fewer than TARGET_TRACKS rather than blow the budget.
const MAX_RESOLVE_ATTEMPTS = 60;

export type RefreshedTrack = {
  recordingMbid: string;
  albumMbid: string;
  albumPosition: number;
  title: string;
  artistName: string;
  albumTitle: string | null;
  coverUrl: string | null;
  durationMs: number | null;
};

/** Upsert the SYSTEM_PLAYLISTS definitions into Playlist rows by slug. New rows
 * are marked due immediately (nextRefreshAt=now) so the refresh job's per-tick
 * cap fills them in gently; existing rows keep their schedule. */
export async function seedSystemPlaylists(now = new Date()): Promise<void> {
  for (const def of SYSTEM_PLAYLISTS) {
    await prisma.playlist.upsert({
      where: { slug: def.slug },
      create: {
        slug: def.slug,
        name: def.name,
        description: def.description,
        isSystem: true,
        tagsJson: JSON.stringify(def.tags),
        nextRefreshAt: now,
      },
      update: {
        name: def.name,
        description: def.description,
        tagsJson: JSON.stringify(def.tags),
      },
    });
  }
}

function parseTags(tagsJson: string | null): string[] {
  if (!tagsJson) return [];
  try {
    const parsed = JSON.parse(tagsJson);
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Rebuild a system playlist's tracks for the current week. Pulls top tracks for
 * each tag from Last.fm (enriched via Deezer), dedupes, shuffles with a
 * week-seeded PRNG so the set rotates weekly, resolves each to a MusicBrainz
 * album position, and replaces the playlist's rows. Returns the new tracks so
 * the caller can trigger subscriber downloads. Never throws.
 */
export async function refreshSystemPlaylist(
  playlist: { id: string; slug: string | null; tagsJson: string | null },
  lastFmKey: string,
  now = new Date(),
): Promise<RefreshedTrack[]> {
  const tags = parseTags(playlist.tagsJson);
  if (tags.length === 0) return [];

  // Gather candidates across all tags.
  const pools = await Promise.all(
    tags.map((tag) => getGenreFallbackTracks(tag, lastFmKey, POOL_PER_TAG).catch(() => [])),
  );
  const seen = new Set<string>();
  const candidates = pools.flat().filter((t) => {
    const key = `${t.artistName}::${t.title}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const ordered = seededShuffle(candidates, `${playlist.slug}:${isoWeekPeriodKey(now)}`);

  const resolved: RefreshedTrack[] = [];
  const usedAlbumPos = new Set<string>();
  let attempts = 0;
  for (const cand of ordered) {
    if (resolved.length >= TARGET_TRACKS || attempts >= MAX_RESOLVE_ATTEMPTS) break;
    attempts++;
    const song = await resolveSong(cand, { includeSingles: true });
    if (!song) continue;
    const dedupeKey = `${song.albumMbid}:${song.albumPosition}`;
    if (usedAlbumPos.has(dedupeKey)) continue;
    usedAlbumPos.add(dedupeKey);
    resolved.push({
      recordingMbid: song.recordingMbid ?? dedupeKey,
      albumMbid: song.albumMbid,
      albumPosition: song.albumPosition,
      title: song.title,
      artistName: song.artistName,
      albumTitle: song.albumTitle,
      coverUrl: song.coverUrl,
      durationMs: song.durationMs,
    });
  }

  if (resolved.length === 0) return [];

  await prisma.$transaction(async (tx) => {
    await tx.playlistTrack.deleteMany({ where: { playlistId: playlist.id } });
    await tx.playlistTrack.createMany({
      data: resolved.map((t, idx) => ({
        playlistId: playlist.id,
        position: idx + 1,
        recordingMbid: t.recordingMbid,
        trackFileId: null,
        albumMbid: t.albumMbid,
        albumPosition: t.albumPosition,
        title: t.title,
        artistName: t.artistName,
        albumTitle: t.albumTitle,
        coverUrl: t.coverUrl,
        durationMs: t.durationMs,
      })),
    });
    await tx.playlist.update({
      where: { id: playlist.id },
      data: { lastRefreshedAt: now, updatedAt: now },
    });
  });

  return resolved;
}
