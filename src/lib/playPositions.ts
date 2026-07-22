import { prisma } from "@/lib/db";
import { shouldResume } from "@/lib/resumePlayback";
import { isAdmin, type LibraryViewer } from "@/lib/userLibrary";

// Resume-playback persistence ("continue where you left off"). One
// PlayPosition row per (userId, trackKey); trackKey follows the PlayHistory
// key scheme — a real recording MBID or a `lidarr:<id>` pseudo-id. Written
// by the player as a full stream progresses, cleared when the track finishes.

export type SavePlayPositionInput = {
  trackKey: string;
  title: string;
  artistName: string;
  albumTitle?: string | null;
  positionMs: number;
  durationMs: number;
};

/**
 * Upsert the resume point for a track. Light validation only — the player is
 * the source of truth and saves are fire-and-forget, so invalid inputs are
 * dropped silently rather than surfaced.
 */
export async function upsertPlayPosition(
  userId: string,
  input: SavePlayPositionInput,
): Promise<void> {
  if (!input.trackKey || !input.title || !input.artistName) return;
  if (!Number.isFinite(input.positionMs) || input.positionMs < 0) return;
  if (!Number.isFinite(input.durationMs) || input.durationMs <= 0) return;
  const positionMs = Math.round(input.positionMs);
  const durationMs = Math.round(input.durationMs);
  await prisma.playPosition.upsert({
    where: { userId_trackKey: { userId, trackKey: input.trackKey } },
    create: {
      userId,
      trackKey: input.trackKey,
      title: input.title,
      artistName: input.artistName,
      albumTitle: input.albumTitle ?? null,
      positionMs,
      durationMs,
    },
    update: {
      title: input.title,
      artistName: input.artistName,
      albumTitle: input.albumTitle ?? null,
      positionMs,
      durationMs,
    },
  });
}

/**
 * Delete the resume point for a track. deleteMany (not delete) so clearing is
 * idempotent — the player fires this on every completed play, whether or not
 * a row exists.
 */
export async function clearPlayPosition(
  userId: string,
  trackKey: string,
): Promise<void> {
  if (!trackKey) return;
  await prisma.playPosition.deleteMany({ where: { userId, trackKey } });
}

export async function getPlayPosition(userId: string, trackKey: string) {
  if (!trackKey) return null;
  return prisma.playPosition.findUnique({
    where: { userId_trackKey: { userId, trackKey } },
  });
}

/** Newest-first resume points for a user (the "Continue playing" shelf). */
export async function listRecentPositions(userId: string, limit = 20) {
  return prisma.playPosition.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });
}

export type ResumableTrack = {
  /** DownloadedTrack id — queue item id and /api/stream/local/<id> source. */
  id: string;
  trackKey: string;
  title: string;
  artistName: string;
  albumTitle: string | null;
  albumMbid: string;
  coverUrl: string | null;
  durationMs: number | null;
  recordingMbid: string | null;
  positionMs: number;
  /** Duration captured when the position was saved (drives the progress bar). */
  positionDurationMs: number;
  updatedAt: Date;
};

/**
 * Resolve the user's resumable positions to tracks they can actually stream.
 * Positions below the resume threshold, or whose track left the viewer's
 * library, drop out — same rule as the recently/most-played shelves.
 */
export async function getResumableTracks(
  userId: string,
  limit = 10,
  viewer: LibraryViewer = { id: userId },
): Promise<ResumableTrack[]> {
  if (!viewer) return [];
  const positions = (await listRecentPositions(userId, 20)).filter((p) =>
    shouldResume(p.positionMs, p.durationMs),
  );
  if (positions.length === 0) return [];
  const tracks = await prisma.downloadedTrack.findMany({
    where: {
      recordingMbid: { in: positions.map((p) => p.trackKey) },
      ephemeral: false,
      ...(isAdmin(viewer) ? {} : { users: { some: { userId: viewer.id } } }),
    },
    select: {
      id: true,
      recordingMbid: true,
      title: true,
      artistName: true,
      albumTitle: true,
      albumMbid: true,
      coverUrl: true,
      durationMs: true,
    },
  });
  const byRecording = new Map(
    tracks.flatMap((t) => (t.recordingMbid ? [[t.recordingMbid, t] as const] : [])),
  );
  return positions
    .flatMap((p) => {
      const t = byRecording.get(p.trackKey);
      if (!t) return [];
      return [
        {
          id: t.id,
          trackKey: p.trackKey,
          title: t.title,
          artistName: t.artistName,
          albumTitle: t.albumTitle,
          albumMbid: t.albumMbid,
          coverUrl: t.coverUrl,
          durationMs: t.durationMs,
          recordingMbid: t.recordingMbid,
          positionMs: p.positionMs,
          positionDurationMs: p.durationMs,
          updatedAt: p.updatedAt,
        },
      ];
    })
    .slice(0, limit);
}
