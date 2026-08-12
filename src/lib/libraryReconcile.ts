// Reconciling a library that drifted.
//
// Auto-downloading a featured playlist fetched ~30 tracks a week per playlist,
// and nothing ever let go of the ones that rotated out. Over time the library
// fills with tracks nothing points at any more. releaseDroppedTracks handles
// this going forward (it diffs each weekly refresh); this is the sweep for what
// already accumulated, plus provenance now marks new downloads so the two can
// eventually be the same question.
//
// Everything here is PLAN FIRST. planLibraryRelease only reads, and returns the
// exact rows it would touch with the reason each was kept or not, so the list
// can be reviewed before anything is deleted. applyLibraryRelease acts only on
// ids it is handed.

import { unlink } from "node:fs/promises";
import { trackMatchKey } from "@/lib/deezer";
import { prisma } from "@/lib/db";
import { trackLikeTargetId } from "@/lib/likeKeys";

export type ReleaseCandidate = {
  downloadedTrackId: string;
  title: string;
  artistName: string;
  albumTitle: string | null;
  /** MANUAL rows predate provenance or were asked for directly. */
  source: string;
  /** True when nothing else in the system references the file either. */
  wouldDeleteFile: boolean;
};

export type ReleasePlan = {
  totalInLibrary: number;
  /** Kept, with why — the counts that make the plan reviewable. */
  keptLiked: number;
  keptInOwnPlaylist: number;
  keptInSubscribedPlaylist: number;
  keptManual: number;
  candidates: ReleaseCandidate[];
  filesToDelete: number;
};

/**
 * What a reconcile *would* do for this user. Read-only.
 *
 * `includeManual` is the whole judgement call. Rows created before provenance
 * existed all read MANUAL, so with it false the plan is empty for a legacy
 * library; with it true the plan falls back to "nothing points at this any
 * more", which is the honest signal available for those rows but can't tell a
 * rotated-out playlist pick from something you downloaded yourself and never
 * liked.
 */
export async function planLibraryRelease(
  userId: string,
  { includeManual = false }: { includeManual?: boolean } = {},
): Promise<ReleasePlan> {
  const rows = await prisma.userDownloadedTrack.findMany({
    where: { userId },
    select: {
      source: true,
      downloadedTrack: {
        select: {
          id: true,
          title: true,
          artistName: true,
          albumTitle: true,
          albumMbid: true,
          albumPosition: true,
          recordingMbid: true,
          ephemeral: true,
        },
      },
    },
  });

  const heldByPlaylist = await subscribedTrackKeys(userId);
  const likedIds = new Set(
    (
      await prisma.like.findMany({
        where: { userId, targetType: "TRACK" },
        select: { targetId: true },
      })
    ).map((l) => l.targetId),
  );
  const ownPlaylistKeys = new Set(
    (
      await prisma.playlistTrack.findMany({
        where: { playlist: { userId } },
        select: { albumMbid: true, albumPosition: true },
      })
    ).map((t) => `${t.albumMbid}:${t.albumPosition}`),
  );

  const plan: ReleasePlan = {
    totalInLibrary: rows.length,
    keptLiked: 0,
    keptInOwnPlaylist: 0,
    keptInSubscribedPlaylist: 0,
    keptManual: 0,
    candidates: [],
    filesToDelete: 0,
  };

  for (const row of rows) {
    const t = row.downloadedTrack;
    // Temp mix tracks have their own sweep (pruneEphemeralTracks); leave them.
    if (t.ephemeral) continue;

    const targetId = trackLikeTargetId(t.recordingMbid, t.albumMbid, t.albumPosition);
    if (targetId && likedIds.has(targetId)) {
      plan.keptLiked++;
      continue;
    }
    if (ownPlaylistKeys.has(`${t.albumMbid}:${t.albumPosition}`)) {
      plan.keptInOwnPlaylist++;
      continue;
    }
    if (heldByPlaylist.has(trackMatchKey(t.artistName, t.title))) {
      plan.keptInSubscribedPlaylist++;
      continue;
    }
    if (row.source === "MANUAL" && !includeManual) {
      plan.keptManual++;
      continue;
    }

    const wouldDeleteFile = await isOrphanElsewhere(userId, t, targetId);
    if (wouldDeleteFile) plan.filesToDelete++;
    plan.candidates.push({
      downloadedTrackId: t.id,
      title: t.title,
      artistName: t.artistName,
      albumTitle: t.albumTitle,
      source: row.source,
      wouldDeleteFile,
    });
  }

  return plan;
}

/**
 * Carry out a release for exactly the ids given — nothing is re-derived here,
 * so what was reviewed is what happens. The per-track keep checks still run
 * again as a backstop in case something was liked between plan and apply.
 */
export async function applyLibraryRelease(
  userId: string,
  downloadedTrackIds: string[],
): Promise<{ released: number; filesDeleted: number }> {
  let released = 0;
  let filesDeleted = 0;

  for (const id of downloadedTrackIds) {
    const track = await prisma.downloadedTrack.findUnique({
      where: { id },
      select: {
        id: true,
        filePath: true,
        albumMbid: true,
        albumPosition: true,
        recordingMbid: true,
        ephemeral: true,
      },
    });
    if (!track || track.ephemeral) continue;

    const targetId = trackLikeTargetId(
      track.recordingMbid,
      track.albumMbid,
      track.albumPosition,
    );
    // Re-check: the plan may be minutes old and a like since then wins.
    const liked = targetId
      ? await prisma.like.count({ where: { userId, targetType: "TRACK", targetId } })
      : 0;
    if (liked > 0) continue;

    await prisma.userDownloadedTrack.deleteMany({
      where: { userId, downloadedTrackId: track.id },
    });
    if (targetId) {
      await prisma.request
        .deleteMany({ where: { requestedById: userId, type: "TRACK", mbid: targetId } })
        .catch(() => {});
    }
    released++;

    if (await isOrphanElsewhere(userId, track, targetId, { afterDetach: true })) {
      await unlink(track.filePath).catch(() => {});
      await prisma.downloadedTrack.delete({ where: { id: track.id } }).catch(() => {});
      filesDeleted++;
    }
  }

  return { released, filesDeleted };
}

/** Would the shared row and file be left with nothing pointing at them? */
async function isOrphanElsewhere(
  userId: string,
  track: { id: string; albumMbid: string; albumPosition: number },
  targetId: string | null,
  { afterDetach = false }: { afterDetach?: boolean } = {},
): Promise<boolean> {
  const [others, likes, playlistUses] = await Promise.all([
    prisma.userDownloadedTrack.count({
      where: {
        downloadedTrackId: track.id,
        ...(afterDetach ? {} : { userId: { not: userId } }),
      },
    }),
    targetId
      ? prisma.like.count({ where: { targetType: "TRACK", targetId } })
      : Promise.resolve(0),
    prisma.playlistTrack.count({
      where: { albumMbid: track.albumMbid, albumPosition: track.albumPosition },
    }),
  ]);
  return others === 0 && likes === 0 && playlistUses === 0;
}

/** artist|title for every track in every playlist this user auto-downloads. */
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
