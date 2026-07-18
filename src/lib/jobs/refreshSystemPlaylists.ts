// Refresh of system (editorial) playlists. Each run seeds the definitions, then:
//   - fills EVERY empty playlist immediately (cheap now — no MusicBrainz at
//     refresh — so a fresh deploy populates all of them within one run), and
//   - re-refreshes playlists whose weekly schedule is due, a few per tick so the
//     ongoing churn stays spread out.
// After a refresh, each subscriber gets the new tracks resolved to MusicBrainz
// and auto-downloaded permanently into their library.

import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { resolveSong } from "@/lib/songResolve";
import { refreshSystemPlaylist, seedSystemPlaylists } from "@/lib/systemPlaylists";
import { ensureTrackRequested } from "@/lib/trackRequests";

// Cap on the staggered WEEKLY re-refresh per tick (empty playlists ignore this —
// they need content now). ponytail: fixed cap, fine for ~14 playlists.
const MAX_DUE_PER_TICK = 4;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export async function refreshSystemPlaylists(): Promise<{ refreshed: number }> {
  const settings = await getSettings();
  if (!settings.lastFmApiKey) return { refreshed: 0 };

  await seedSystemPlaylists();

  const now = new Date();
  const all = await prisma.playlist.findMany({
    where: { isSystem: true },
    orderBy: { nextRefreshAt: "asc" },
    select: {
      id: true,
      slug: true,
      tagsJson: true,
      nextRefreshAt: true,
      _count: { select: { systemTracks: true } },
    },
  });

  const empties = all.filter((p) => p._count.systemTracks === 0);
  const due = all
    .filter(
      (p) =>
        p._count.systemTracks > 0 &&
        p.nextRefreshAt != null &&
        p.nextRefreshAt <= now,
    )
    .slice(0, MAX_DUE_PER_TICK);

  let refreshed = 0;
  // Sequential, and each playlist's lookups are throttled (see getGenrePreviewTracks).
  for (const playlist of [...empties, ...due]) {
    try {
      const tracks = await refreshSystemPlaylist(playlist, settings.lastFmApiKey, now);
      await prisma.playlist.update({
        where: { id: playlist.id },
        data: { nextRefreshAt: new Date(now.getTime() + WEEK_MS) },
      });
      if (tracks.length > 0) await downloadForSubscribers(playlist.id, tracks);
      refreshed++;
    } catch (err) {
      console.error(`[refreshSystemPlaylists] failed for ${playlist.slug}:`, err);
    }
  }
  return { refreshed };
}

/** Resolve each (unresolved) track to MusicBrainz and queue a permanent
 * download for every subscriber. Best-effort: a resolve/queue miss skips that
 * track. */
async function downloadForSubscribers(
  playlistId: string,
  tracks: { title: string; artistName: string; albumTitle: string | null; coverUrl: string | null }[],
): Promise<void> {
  const subs = await prisma.playlistSubscription.findMany({
    where: { playlistId },
    select: { userId: true },
  });
  if (subs.length === 0) return;

  for (const t of tracks) {
    const resolved = await resolveSong(t, { includeSingles: true }).catch(() => null);
    if (!resolved) continue;
    for (const sub of subs) {
      await ensureTrackRequested(
        sub.userId,
        {
          albumMbid: resolved.albumMbid,
          albumTitle: resolved.albumTitle,
          artistName: resolved.artistName,
          coverUrl: resolved.coverUrl,
          recordingMbid: resolved.recordingMbid,
          trackTitle: resolved.title,
          albumPosition: resolved.albumPosition,
        },
        { forceApproval: true },
      );
    }
  }
}
