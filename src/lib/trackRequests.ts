// Shared single-track fetch logic, used by the album-page track button and by
// playlist auto-fetch. Idempotent and best-effort: it never throws, so callers
// (e.g. adding a track to a playlist) succeed even if the fetch can't start.

import { executeRequestApproval } from "@/app/admin/requests/actions";
import { prisma } from "@/lib/db";
import { attachDownloadedTrackToUser } from "@/lib/downloadedTracks";
import { getSettings } from "@/lib/settings";

export type EnsureTrackInput = {
  albumMbid: string;
  albumTitle: string | null;
  artistName: string;
  coverUrl: string | null;
  recordingMbid: string | null;
  trackTitle: string;
  albumPosition: number;
};

/**
 * Ensure a single track is on its way to the user's library.
 *   1. Already requested (pending/in-flight/done) → nothing to do.
 *   2. Already downloaded by anyone → just grant this user visibility.
 *   3. Otherwise create a TRACK request and kick off the slskd download
 *      immediately if the user is auto-approved — or unconditionally when
 *      `opts.forceApproval` is set (e.g. playlist subscriptions, where the
 *      subscribe itself is the explicit ask).
 */
export async function ensureTrackRequested(
  userId: string,
  input: EnsureTrackInput,
  opts: { ephemeral?: boolean; expiresAt?: Date | null; forceApproval?: boolean } = {},
): Promise<void> {
  try {
    const mbid =
      input.recordingMbid ?? `${input.albumMbid}:${input.albumPosition}`;
    const ephemeral = opts.ephemeral ?? false;

    const existing = await prisma.request.findFirst({
      where: {
        requestedById: userId,
        type: "TRACK",
        mbid,
        status: { in: ["PENDING", "APPROVED", "DOWNLOADING", "AVAILABLE"] },
      },
      select: { id: true, ephemeral: true },
    });
    if (existing) {
      // A real (non-ephemeral) request for a track that's currently being
      // pre-downloaded clears the temp flag, so it lands permanent (graduation).
      if (!ephemeral && existing.ephemeral) {
        await prisma.request.update({
          where: { id: existing.id },
          data: { ephemeral: false, expiresAt: null },
        });
      }
      return;
    }

    // Cross-user dedup: the file may already be on disk from someone else's
    // request — grant visibility instead of downloading it again.
    const downloaded = await prisma.downloadedTrack.findUnique({
      where: {
        albumMbid_albumPosition: {
          albumMbid: input.albumMbid,
          albumPosition: input.albumPosition,
        },
      },
      select: { id: true },
    });
    if (downloaded) {
      await attachDownloadedTrackToUser(userId, downloaded.id);
      // A real request keeps an already-downloaded temp track (graduation).
      if (!ephemeral) {
        await prisma.downloadedTrack.updateMany({
          where: { id: downloaded.id, ephemeral: true },
          data: { ephemeral: false, expiresAt: null },
        });
      }
      return;
    }

    const requester = await prisma.user.findUnique({
      where: { id: userId },
      select: { autoApproveTrack: true },
    });

    const created = await prisma.request.create({
      data: {
        type: "TRACK",
        mbid,
        title: input.trackTitle,
        artistName: input.artistName,
        coverUrl: input.coverUrl,
        albumMbid: input.albumMbid,
        albumTitle: input.albumTitle,
        recordingMbid: input.recordingMbid,
        albumPosition: input.albumPosition,
        requestedById: userId,
        status: "PENDING",
        ephemeral,
        expiresAt: opts.expiresAt ?? null,
      },
    });

    const autoApprove =
      opts.forceApproval === true || requester?.autoApproveTrack === true;
    if (autoApprove) {
      const settings = await getSettings();
      // Detached: approval runs an slskd search that can take several seconds.
      // The request row already exists (so the "fetching" badge shows
      // immediately); approval — and FAILED on error — resolve in the
      // background rather than blocking the add. Safe on our long-lived server.
      void executeRequestApproval(created, settings).catch((err) => {
        console.error("[trackRequests] background approval failed:", err);
      });
    }
  } catch (err) {
    console.error("[trackRequests] ensureTrackRequested failed:", err);
  }
}

/**
 * Of the given track keys (recordingMbid / synthetic), which have an in-flight
 * TRACK request for this user? Used to badge playlist rows as "fetching".
 */
export async function getActiveTrackRequestKeys(
  userId: string,
  mbids: string[],
): Promise<Set<string>> {
  if (mbids.length === 0) return new Set();
  const rows = await prisma.request.findMany({
    where: {
      requestedById: userId,
      type: "TRACK",
      status: { in: ["PENDING", "APPROVED", "DOWNLOADING"] },
      mbid: { in: mbids },
    },
    select: { mbid: true },
  });
  return new Set(rows.map((r) => r.mbid));
}
