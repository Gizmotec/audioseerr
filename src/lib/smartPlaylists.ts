import { prisma } from "@/lib/db";
import { trackLikeTargetId } from "@/lib/likeKeys";
import {
  evaluateSmartPlaylist,
  parseRules,
  validateLimit,
  validateRules,
  type SmartPlaylistRow,
  type SmartRule,
} from "@/lib/smartPlaylist";
import { isAdmin, type LibraryViewer } from "@/lib/userLibrary";

// Data layer for smart playlists (rule engine: src/lib/smartPlaylist.ts).
// Smart playlists are private to their owner — the model has no sharing flag,
// unlike Playlist.

/** Hard cap on joined library rows any single evaluation considers. */
const EVALUATION_ROW_CAP = 5000;

const MAX_NAME_LENGTH = 100;

export type SmartPlaylistSummary = {
  id: string;
  name: string;
  limit: number;
  rules: SmartRule[];
  updatedAt: Date;
};

function summarize(row: {
  id: string;
  name: string;
  limit: number;
  rulesJson: string;
  updatedAt: Date;
}): SmartPlaylistSummary {
  return {
    id: row.id,
    name: row.name,
    limit: row.limit,
    rules: parseRules(row.rulesJson),
    updatedAt: row.updatedAt,
  };
}

export async function listSmartPlaylists(
  userId: string,
): Promise<SmartPlaylistSummary[]> {
  const rows = await prisma.smartPlaylist.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      limit: true,
      rulesJson: true,
      updatedAt: true,
    },
  });
  return rows.map(summarize);
}

export async function getSmartPlaylist(
  userId: string,
  id: string,
): Promise<SmartPlaylistSummary | null> {
  const row = await prisma.smartPlaylist.findFirst({
    where: { id, userId },
    select: {
      id: true,
      name: true,
      limit: true,
      rulesJson: true,
      updatedAt: true,
    },
  });
  return row ? summarize(row) : null;
}

/**
 * Live evaluation: join the viewer-visible slice of DownloadedTrack with the
 * user's PlayHistory counts and TRACK Likes, then run the pure evaluator.
 *
 * Join notes:
 *   - Plays join on recordingMbid (PlayHistory's only track key); tracks with
 *     a null recordingMbid get plays = 0.
 *   - Likes join on trackLikeTargetId (recordingMbid, else albumMbid:pos).
 *   - genre is passed as null — the schema stores no per-track genre yet, so
 *     genre rules match nothing until such a column lands (see smartPlaylist.ts).
 *   - Row fetch is capped at EVALUATION_ROW_CAP; the viewer scoping mirrors
 *     buildOwnedTrackLookup (admin sees all, others their UserDownloadedTrack
 *     slice), ephemeral temp tracks excluded.
 */
export async function getSmartPlaylistTracks(
  viewer: LibraryViewer,
  playlist: SmartPlaylistSummary,
): Promise<SmartPlaylistRow[]> {
  if (!viewer) return [];
  const userId = viewer.id;

  const [tracks, playCounts, likes] = await Promise.all([
    prisma.downloadedTrack.findMany({
      where: {
        ephemeral: false,
        ...(isAdmin(viewer) ? {} : { users: { some: { userId } } }),
      },
      orderBy: { createdAt: "desc" },
      take: EVALUATION_ROW_CAP,
      select: {
        id: true,
        recordingMbid: true,
        albumMbid: true,
        albumPosition: true,
        title: true,
        artistName: true,
        albumTitle: true,
        coverUrl: true,
        durationMs: true,
      },
    }),
    prisma.playHistory.groupBy({
      by: ["recordingMbid"],
      where: { userId },
      _count: { _all: true },
    }),
    prisma.like.findMany({
      where: { userId, targetType: "TRACK" },
      select: { targetId: true },
    }),
  ]);

  const playsByRecording = new Map<string, number>(
    playCounts.map((p) => [p.recordingMbid, p._count._all]),
  );
  const likedIds = new Set(likes.map((l) => l.targetId));

  const rows: SmartPlaylistRow[] = tracks.map((t) => {
    const likeId = trackLikeTargetId(
      t.recordingMbid,
      t.albumMbid,
      t.albumPosition,
    );
    return {
      downloadedTrackId: t.id,
      recordingMbid: t.recordingMbid,
      albumMbid: t.albumMbid,
      albumPosition: t.albumPosition,
      title: t.title,
      artistName: t.artistName,
      albumTitle: t.albumTitle,
      coverUrl: t.coverUrl,
      durationMs: t.durationMs,
      genre: null,
      plays: t.recordingMbid
        ? (playsByRecording.get(t.recordingMbid) ?? 0)
        : 0,
      liked: likeId != null && likedIds.has(likeId),
    };
  });

  return evaluateSmartPlaylist(rows, playlist.rules, playlist.limit);
}

// CRUD ----------------------------------------------------------------------

function normalizeName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) throw new Error("Name is required.");
  if (trimmed.length > MAX_NAME_LENGTH) {
    throw new Error(`Name is too long (max ${MAX_NAME_LENGTH} chars).`);
  }
  return trimmed;
}

export async function createSmartPlaylist(
  userId: string,
  input: { name: string; rules: unknown; limit?: unknown },
): Promise<{ id: string }> {
  const name = normalizeName(input.name);
  const validated = validateRules(input.rules);
  if (!validated.ok) throw new Error(validated.error);
  const limit = validateLimit(input.limit);
  if (limit == null) {
    throw new Error("Limit must be a whole number between 1 and 500.");
  }
  const row = await prisma.smartPlaylist.create({
    data: {
      userId,
      name,
      rulesJson: JSON.stringify(validated.rules),
      limit,
    },
    select: { id: true },
  });
  return row;
}

export async function updateSmartPlaylist(
  userId: string,
  id: string,
  input: { name?: string; rules?: unknown; limit?: unknown },
): Promise<void> {
  const existing = await prisma.smartPlaylist.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!existing) throw new Error("Smart playlist not found.");

  const data: { name?: string; rulesJson?: string; limit?: number } = {};
  if (input.name !== undefined) {
    data.name = normalizeName(input.name);
  }
  if (input.rules !== undefined) {
    const validated = validateRules(input.rules);
    if (!validated.ok) throw new Error(validated.error);
    data.rulesJson = JSON.stringify(validated.rules);
  }
  if (input.limit !== undefined) {
    const limit = validateLimit(input.limit);
    if (limit == null) {
      throw new Error("Limit must be a whole number between 1 and 500.");
    }
    data.limit = limit;
  }
  if (Object.keys(data).length === 0) return;

  await prisma.smartPlaylist.update({ where: { id: existing.id }, data });
}

export async function deleteSmartPlaylist(
  userId: string,
  id: string,
): Promise<void> {
  // Scope by userId so a forged id from another user does nothing.
  const result = await prisma.smartPlaylist.deleteMany({
    where: { id, userId },
  });
  if (result.count === 0) throw new Error("Smart playlist not found.");
}
