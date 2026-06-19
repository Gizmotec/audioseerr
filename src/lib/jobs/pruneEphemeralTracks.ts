// Sweep expired discovery-mix temp tracks. A temp (ephemeral) track that the
// user kept — liked it or added it to a playlist — is graduated to a permanent
// library track (a safety net in case the inline graduation in
// ensureTrackRequested was raced). Everything else past its expiry is deleted:
// the file on disk, the DownloadedTrack row (which cascades its per-user
// visibility rows), and the originating ephemeral Request.
//
// SAFETY: this only ever touches rows with ephemeral=true, and only deletes
// after re-confirming there is no like and no playlist membership. Real library
// tracks (ephemeral=false) are structurally outside the query.

import { unlink } from "node:fs/promises";
import { prisma } from "@/lib/db";
import { trackLikeTargetId } from "@/lib/likeKeys";

export async function pruneEphemeralTracks(): Promise<{
  graduated: number;
  deleted: number;
}> {
  const now = new Date();
  const expired = await prisma.downloadedTrack.findMany({
    where: { ephemeral: true, expiresAt: { lt: now } },
    select: {
      id: true,
      filePath: true,
      recordingMbid: true,
      albumMbid: true,
      albumPosition: true,
    },
  });

  let graduated = 0;
  let deleted = 0;

  for (const t of expired) {
    const targetId = trackLikeTargetId(t.recordingMbid, t.albumMbid, t.albumPosition);
    const [likeCount, playlistCount] = await Promise.all([
      targetId
        ? prisma.like.count({ where: { targetType: "TRACK", targetId } })
        : Promise.resolve(0),
      prisma.playlistTrack.count({
        where: { albumMbid: t.albumMbid, albumPosition: t.albumPosition },
      }),
    ]);

    if (likeCount > 0 || playlistCount > 0) {
      // Kept after all — promote to a permanent library track.
      await prisma.downloadedTrack.update({
        where: { id: t.id },
        data: { ephemeral: false, expiresAt: null },
      });
      if (targetId) {
        await prisma.request
          .updateMany({
            where: { ephemeral: true, type: "TRACK", mbid: targetId },
            data: { ephemeral: false, expiresAt: null },
          })
          .catch(() => {});
      }
      graduated++;
      continue;
    }

    // Unkept and expired — delete the file and the row.
    await unlink(t.filePath).catch(() => {
      // Best-effort; the DB row is removed regardless.
    });
    await prisma.downloadedTrack.delete({ where: { id: t.id } }).catch(() => {});
    if (targetId) {
      // Drop the stale ephemeral request so a future run can re-fetch this pick.
      await prisma.request
        .deleteMany({ where: { ephemeral: true, type: "TRACK", mbid: targetId } })
        .catch(() => {});
    }
    deleted++;
  }

  return { graduated, deleted };
}
