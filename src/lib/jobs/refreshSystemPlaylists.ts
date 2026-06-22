// Weekly refresh of system (editorial) playlists. Each run seeds the
// definitions, then refreshes up to MAX_PER_TICK playlists whose nextRefreshAt
// is due — so with an hourly cron the server never refreshes them all at once.
// After a refresh, each subscriber gets the new tracks auto-downloaded into temp
// (ephemeral) storage, the same path discovery-mix pre-download uses.

import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { refreshSystemPlaylist, seedSystemPlaylists } from "@/lib/systemPlaylists";
import { ensureTrackRequested } from "@/lib/trackRequests";

// ponytail: fixed cap (~MAX_PER_TICK playlists/hour). The staggering the design
// asks for falls straight out of this + each row's own weekly nextRefreshAt.
const MAX_PER_TICK = 2;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
// Subscriber temp downloads live a week + grace, mirroring weekly mix retention.
const RETENTION_MS = 8 * 24 * 60 * 60 * 1000;

export async function refreshSystemPlaylists(): Promise<{ refreshed: number }> {
  const settings = await getSettings();
  // No Last.fm key → tracks can't be sourced; nothing to do.
  if (!settings.lastFmApiKey) return { refreshed: 0 };

  await seedSystemPlaylists();

  const now = new Date();
  const due = await prisma.playlist.findMany({
    where: { isSystem: true, nextRefreshAt: { lte: now } },
    orderBy: { nextRefreshAt: "asc" },
    take: MAX_PER_TICK,
    select: { id: true, slug: true, tagsJson: true },
  });

  let refreshed = 0;
  for (const playlist of due) {
    try {
      const tracks = await refreshSystemPlaylist(playlist, settings.lastFmApiKey, now);
      await prisma.playlist.update({
        where: { id: playlist.id },
        data: { nextRefreshAt: new Date(now.getTime() + WEEK_MS) },
      });

      if (tracks.length > 0) {
        const subs = await prisma.playlistSubscription.findMany({
          where: { playlistId: playlist.id },
          select: { userId: true },
        });
        const expiresAt = new Date(now.getTime() + RETENTION_MS);
        for (const sub of subs) {
          for (const t of tracks) {
            await ensureTrackRequested(
              sub.userId,
              {
                albumMbid: t.albumMbid,
                albumTitle: t.albumTitle,
                artistName: t.artistName,
                coverUrl: t.coverUrl,
                // Pass the real recording MBID, or null for synthetic keys.
                recordingMbid:
                  t.recordingMbid === `${t.albumMbid}:${t.albumPosition}`
                    ? null
                    : t.recordingMbid,
                trackTitle: t.title,
                albumPosition: t.albumPosition,
              },
              { ephemeral: true, expiresAt },
            );
          }
        }
      }
      refreshed++;
    } catch (err) {
      console.error(`[refreshSystemPlaylists] failed for ${playlist.slug}:`, err);
    }
  }
  return { refreshed };
}
