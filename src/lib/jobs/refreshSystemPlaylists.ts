// Refresh of system (editorial) playlists. Each run seeds the definitions, then:
//   - fills EVERY empty playlist immediately (cheap now — no MusicBrainz at
//     refresh — so a fresh deploy populates all of them within one run), and
//   - re-refreshes playlists whose weekly schedule is due, a few per tick so the
//     ongoing churn stays spread out.
// After a refresh, each subscriber gets the new tracks resolved to MusicBrainz
// and auto-downloaded permanently into their library — and the picks that fell
// off the playlist are released from their library again unless they kept them
// (see lib/playlistAutoDownload). That second half is what makes "auto
// download" mean "this playlist, as it stands" rather than "everything this
// playlist has ever contained".

import { prisma } from "@/lib/db";
import { trackMatchKey } from "@/lib/deezer";
import {
  releaseDroppedTracks,
  type PlaylistTrackRef,
} from "@/lib/playlistAutoDownload";
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
      // Snapshot the outgoing picks so we can tell what actually dropped off.
      const before: PlaylistTrackRef[] = await prisma.systemPlaylistTrack.findMany({
        where: { playlistId: playlist.id },
        select: { title: true, artistName: true },
      });
      const tracks = await refreshSystemPlaylist(playlist, settings.lastFmApiKey, now);
      await prisma.playlist.update({
        where: { id: playlist.id },
        data: { nextRefreshAt: new Date(now.getTime() + WEEK_MS) },
      });
      if (tracks.length > 0) {
        await downloadForSubscribers(playlist.id, tracks);
        // Runs after the swap, so a track that merely moved to another
        // auto-downloaded playlist is still seen as held.
        await releaseForSubscribers(playlist.id, before, tracks);
      }
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

/**
 * Let go of the picks that left this playlist. Per subscriber, since "did you
 * keep this?" is a per-user question — a like or a playlist entry by one user
 * doesn't hold the track in anyone else's library.
 */
async function releaseForSubscribers(
  playlistId: string,
  before: PlaylistTrackRef[],
  after: PlaylistTrackRef[],
): Promise<void> {
  const keep = new Set(after.map((t) => trackMatchKey(t.artistName, t.title)));
  const dropped = before.filter(
    (t) => !keep.has(trackMatchKey(t.artistName, t.title)),
  );
  if (dropped.length === 0) return;

  const subs = await prisma.playlistSubscription.findMany({
    where: { playlistId },
    select: { userId: true },
  });
  for (const sub of subs) {
    const { released, filesDeleted } = await releaseDroppedTracks(sub.userId, dropped);
    if (released > 0) {
      console.log(
        `[refreshSystemPlaylists] released ${released} track(s) for ${sub.userId} (${filesDeleted} file(s) deleted)`,
      );
    }
  }
}
