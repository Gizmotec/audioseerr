// Keeping an auto-downloaded (subscribed) featured playlist in sync.
//
// Turning auto-download on means "hold this whole playlist on disk". The
// downloads were already handled; what was missing is the other half — when the
// weekly refresh swaps picks out, the tracks that dropped off used to sit in the
// library forever. This releases them.
//
// SAFETY — a released track is only ever removed from the *user's* library
// (their UserDownloadedTrack row). The file and the shared DownloadedTrack row
// are deleted only when the track is fully orphaned: nobody else has it, nobody
// has liked it, and it isn't in any playlist. A track is never released at all
// when the user liked it, put it in one of their own playlists, or still has it
// via another playlist they auto-download. Same rules pruneEphemeralTracks
// already applies to discovery temp tracks.

import { unlink } from "node:fs/promises";
import { trackMatchKey } from "@/lib/deezer";
import { prisma } from "@/lib/db";
import { trackLikeTargetId } from "@/lib/likeKeys";

/** The shape a system playlist stores per track — title + artist, no MBIDs. */
export type PlaylistTrackRef = { title: string; artistName: string };

/**
 * Drop tracks that fell out of an auto-downloaded playlist from a user's
 * library, unless they've been kept some other way. Returns how many were let
 * go. Best-effort: never throws, so a refresh is never blocked by cleanup.
 */
export async function releaseDroppedTracks(
  userId: string,
  dropped: PlaylistTrackRef[],
): Promise<{ released: number; filesDeleted: number }> {
  let released = 0;
  let filesDeleted = 0;
  if (dropped.length === 0) return { released, filesDeleted };

  try {
    // Everything still spoken for by a playlist this user auto-downloads stays,
    // even if it left the one being refreshed.
    const stillSubscribed = await subscribedTrackKeys(userId);

    const mine = await prisma.userDownloadedTrack.findMany({
      where: { userId },
      select: {
        downloadedTrack: {
          select: {
            id: true,
            title: true,
            artistName: true,
            filePath: true,
            recordingMbid: true,
            albumMbid: true,
            albumPosition: true,
          },
        },
      },
    });
    const byKey = new Map(
      mine.map((r) => [
        trackMatchKey(r.downloadedTrack.artistName, r.downloadedTrack.title),
        r.downloadedTrack,
      ]),
    );

    for (const ref of dropped) {
      const key = trackMatchKey(ref.artistName, ref.title);
      if (stillSubscribed.has(key)) continue;
      const track = byKey.get(key);
      if (!track) continue;

      const targetId = trackLikeTargetId(
        track.recordingMbid,
        track.albumMbid,
        track.albumPosition,
      );

      // Liked by this user, or sitting in a playlist they built — theirs to keep.
      const [likedByUser, inOwnPlaylist] = await Promise.all([
        targetId
          ? prisma.like.count({
              where: { userId, targetType: "TRACK", targetId },
            })
          : Promise.resolve(0),
        prisma.playlistTrack.count({
          where: {
            albumMbid: track.albumMbid,
            albumPosition: track.albumPosition,
            playlist: { userId },
          },
        }),
      ]);
      if (likedByUser > 0 || inOwnPlaylist > 0) continue;

      await prisma.userDownloadedTrack.deleteMany({
        where: { userId, downloadedTrackId: track.id },
      });
      // Drop the fulfilled request too, so if this pick comes back around the
      // dedup in ensureTrackRequested doesn't treat it as already delivered.
      if (targetId) {
        await prisma.request
          .deleteMany({ where: { requestedById: userId, type: "TRACK", mbid: targetId } })
          .catch(() => {});
      }
      released++;

      if (await deleteIfOrphaned(track, targetId)) filesDeleted++;
    }
  } catch (err) {
    console.error("[playlistAutoDownload] release failed:", err);
  }

  return { released, filesDeleted };
}

/**
 * Remove the shared row and the file, but only once nothing at all points at it
 * — no user, no like from anyone, no playlist entry.
 */
async function deleteIfOrphaned(
  track: {
    id: string;
    filePath: string;
    albumMbid: string;
    albumPosition: number;
  },
  targetId: string | null,
): Promise<boolean> {
  const [users, likes, playlistUses] = await Promise.all([
    prisma.userDownloadedTrack.count({ where: { downloadedTrackId: track.id } }),
    targetId
      ? prisma.like.count({ where: { targetType: "TRACK", targetId } })
      : Promise.resolve(0),
    prisma.playlistTrack.count({
      where: { albumMbid: track.albumMbid, albumPosition: track.albumPosition },
    }),
  ]);
  if (users > 0 || likes > 0 || playlistUses > 0) return false;

  await unlink(track.filePath).catch(() => {
    // Best-effort; the row goes regardless so the library doesn't point at a
    // file we can't serve.
  });
  await prisma.downloadedTrack.delete({ where: { id: track.id } }).catch(() => {});
  return true;
}

/** artist|title keys for every track in every playlist this user auto-downloads. */
async function subscribedTrackKeys(userId: string): Promise<Set<string>> {
  const subs = await prisma.playlistSubscription.findMany({
    where: { userId },
    select: {
      playlist: {
        select: { systemTracks: { select: { title: true, artistName: true } } },
      },
    },
  });
  const keys = new Set<string>();
  for (const s of subs) {
    for (const t of s.playlist.systemTracks) {
      keys.add(trackMatchKey(t.artistName, t.title));
    }
  }
  return keys;
}
