// System (editorial) playlists — Spotify-style mood/genre playlists owned by no
// one, visible to everyone, refreshed weekly from Last.fm tags. Definitions live
// here as a code constant; seedSystemPlaylists() upserts them into Playlist rows
// (isSystem=true) by slug, and refreshSystemPlaylist() repopulates a row's tracks
// each week. The cron that drives the schedule is src/lib/jobs/refreshSystemPlaylists.

import { existsSync } from "node:fs";
import path from "node:path";
import { type DiscoveryTrack, trackMatchKey } from "@/lib/deezer";
import { prisma } from "@/lib/db";
import { getGenrePreviewTracks } from "@/lib/genreFallbackTracks";
import { isoWeekPeriodKey, seededShuffle } from "@/lib/mixes";

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
    tags: ["synthwave", "chillwave", "electronic"],
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

const TARGET_TRACKS = 30;
// Over-fetch seeds per tag: findDeezerTrack only keeps exact artist+title
// matches, so the pool shrinks a lot before we reach TARGET_TRACKS.
const POOL_PER_TAG = 40;

// Convention-over-config cover: a playlist gets a custom cover by dropping
// public/playlist-covers/<slug>.png — no code change needed. Returns the public
// URL when the file exists, else null (UI falls back to a track-art mosaic).
function coverForSlug(slug: string): string | null {
  const file = path.join(process.cwd(), "public", "playlist-covers", `${slug}.png`);
  return existsSync(file) ? `/playlist-covers/${slug}.png` : null;
}

/** Upsert the SYSTEM_PLAYLISTS definitions into Playlist rows by slug. New rows
 * are marked due immediately (nextRefreshAt=now); existing rows keep their
 * schedule. Also clears any stale PlaylistTrack rows left over from the earlier
 * library-style implementation — system playlists now store SystemPlaylistTrack. */
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
        coverUrl: coverForSlug(def.slug),
        nextRefreshAt: now,
      },
      update: {
        name: def.name,
        description: def.description,
        tagsJson: JSON.stringify(def.tags),
        coverUrl: coverForSlug(def.slug),
      },
    });
  }
  // One-time migration cleanup: the first cut stored system tracks as resolved
  // PlaylistTrack rows. Those are no longer read; drop them.
  await prisma.playlistTrack.deleteMany({ where: { playlist: { isSystem: true } } });
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
 * each tag from Last.fm enriched with Deezer 30s previews, dedupes, shuffles
 * with a week-seeded PRNG so the set rotates weekly, and replaces the playlist's
 * SystemPlaylistTrack rows. No MusicBrainz resolution — that happens lazily on
 * download — so this is cheap and fills fast. Returns the tracks. Never throws.
 */
export async function refreshSystemPlaylist(
  playlist: { id: string; slug: string | null; tagsJson: string | null },
  lastFmKey: string,
  now = new Date(),
): Promise<DiscoveryTrack[]> {
  const tags = parseTags(playlist.tagsJson);
  if (tags.length === 0) return [];

  // Tags sequentially — one ~24-wide Deezer enrich burst at a time keeps
  // concurrency in the range the existing genre fallback already runs at.
  const pool: DiscoveryTrack[] = [];
  for (const tag of tags) {
    pool.push(
      ...(await getGenrePreviewTracks(tag, lastFmKey, POOL_PER_TAG).catch(() => [])),
    );
  }

  const seen = new Set<string>();
  const deduped = pool.filter((t) => {
    const key = trackMatchKey(t.artistName, t.title);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const tracks = seededShuffle(
    deduped,
    `${playlist.slug}:${isoWeekPeriodKey(now)}`,
  ).slice(0, TARGET_TRACKS);
  if (tracks.length === 0) return [];

  await prisma.$transaction(async (tx) => {
    await tx.systemPlaylistTrack.deleteMany({ where: { playlistId: playlist.id } });
    await tx.systemPlaylistTrack.createMany({
      data: tracks.map((t, idx) => ({
        playlistId: playlist.id,
        position: idx + 1,
        title: t.title,
        artistName: t.artistName,
        albumTitle: t.albumTitle,
        coverUrl: t.coverUrl,
        previewUrl: t.previewUrl,
        durationMs: t.durationMs,
      })),
    });
    await tx.playlist.update({
      where: { id: playlist.id },
      data: { lastRefreshedAt: now, updatedAt: now },
    });
  });

  return tracks;
}
