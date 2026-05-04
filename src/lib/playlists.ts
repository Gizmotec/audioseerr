import { prisma } from "@/lib/db";
import { getLibraryHit, getLibraryHitByName } from "@/lib/library";
import type { LidarrConfig } from "@/lib/lidarr";
import { buildTrackFileLookup } from "@/lib/playback";
import { getSettings } from "@/lib/settings";

export type PlaylistSummary = {
  id: string;
  name: string;
  description: string | null;
  trackCount: number;
  coverUrl: string | null;
  updatedAt: Date;
};

export type PlaylistTrackRow = {
  id: string;
  position: number;
  recordingMbid: string;
  trackFileId: number;
  albumMbid: string;
  albumPosition: number;
  title: string;
  artistName: string;
  albumTitle: string | null;
  coverUrl: string | null;
  durationMs: number | null;
};

export type PlaylistDetail = {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  tracks: PlaylistTrackRow[];
};

export type AddTrackPayload = {
  recordingMbid: string;
  trackFileId: number;
  albumMbid: string;
  albumPosition: number;
  title: string;
  artistName: string;
  albumTitle?: string | null;
  coverUrl?: string | null;
  durationMs?: number | null;
};

// CRUD ----------------------------------------------------------------------

export async function listPlaylists(userId: string): Promise<PlaylistSummary[]> {
  const rows = await prisma.playlist.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      description: true,
      updatedAt: true,
      tracks: {
        select: { coverUrl: true },
        orderBy: { position: "asc" },
        take: 1,
      },
      _count: { select: { tracks: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    trackCount: r._count.tracks,
    coverUrl: r.tracks[0]?.coverUrl ?? null,
    updatedAt: r.updatedAt,
  }));
}

export async function getPlaylist(
  userId: string,
  playlistId: string,
): Promise<PlaylistDetail | null> {
  const row = await prisma.playlist.findFirst({
    where: { id: playlistId, userId },
    select: {
      id: true,
      name: true,
      description: true,
      createdAt: true,
      updatedAt: true,
      tracks: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          position: true,
          recordingMbid: true,
          trackFileId: true,
          albumMbid: true,
          albumPosition: true,
          title: true,
          artistName: true,
          albumTitle: true,
          coverUrl: true,
          durationMs: true,
        },
      },
    },
  });
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    tracks: row.tracks,
  };
}

export async function createPlaylist(
  userId: string,
  input: { name: string; description?: string | null },
): Promise<{ id: string }> {
  const name = input.name.trim();
  if (name.length === 0) throw new Error("Name is required.");
  if (name.length > 100) throw new Error("Name is too long (max 100 chars).");
  const description = input.description?.trim() || null;
  const row = await prisma.playlist.create({
    data: { userId, name, description },
    select: { id: true },
  });
  return row;
}

export async function updatePlaylist(
  userId: string,
  playlistId: string,
  input: { name?: string; description?: string | null },
): Promise<void> {
  const existing = await prisma.playlist.findFirst({
    where: { id: playlistId, userId },
    select: { id: true },
  });
  if (!existing) throw new Error("Playlist not found.");

  const data: { name?: string; description?: string | null } = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (name.length === 0) throw new Error("Name is required.");
    if (name.length > 100) throw new Error("Name is too long (max 100 chars).");
    data.name = name;
  }
  if (input.description !== undefined) {
    data.description = input.description?.trim() || null;
  }
  if (Object.keys(data).length === 0) return;
  await prisma.playlist.update({ where: { id: playlistId }, data });
}

export async function deletePlaylist(
  userId: string,
  playlistId: string,
): Promise<void> {
  // Scope by userId so a forged id from another user does nothing.
  const result = await prisma.playlist.deleteMany({
    where: { id: playlistId, userId },
  });
  if (result.count === 0) throw new Error("Playlist not found.");
}

// Track operations ----------------------------------------------------------

export async function addTrackToPlaylist(
  userId: string,
  playlistId: string,
  payload: AddTrackPayload,
): Promise<{ id: string; position: number }> {
  return prisma.$transaction(async (tx) => {
    const playlist = await tx.playlist.findFirst({
      where: { id: playlistId, userId },
      select: { id: true },
    });
    if (!playlist) throw new Error("Playlist not found.");

    // Append at end. A small race between two concurrent adds could pick the
    // same `next` value; in practice a single user isn't double-clicking from
    // two windows, and the index permits duplicates so it's not destructive.
    const last = await tx.playlistTrack.findFirst({
      where: { playlistId },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    const next = (last?.position ?? 0) + 1;

    const created = await tx.playlistTrack.create({
      data: {
        playlistId,
        position: next,
        recordingMbid: payload.recordingMbid,
        trackFileId: payload.trackFileId,
        albumMbid: payload.albumMbid,
        albumPosition: payload.albumPosition,
        title: payload.title,
        artistName: payload.artistName,
        albumTitle: payload.albumTitle ?? null,
        coverUrl: payload.coverUrl ?? null,
        durationMs: payload.durationMs ?? null,
      },
      select: { id: true, position: true },
    });

    await tx.playlist.update({
      where: { id: playlistId },
      data: { updatedAt: new Date() },
    });

    return created;
  });
}

export async function removeTrackFromPlaylist(
  userId: string,
  playlistId: string,
  trackRowId: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const playlist = await tx.playlist.findFirst({
      where: { id: playlistId, userId },
      select: { id: true },
    });
    if (!playlist) throw new Error("Playlist not found.");

    const removed = await tx.playlistTrack.findFirst({
      where: { id: trackRowId, playlistId },
      select: { position: true },
    });
    if (!removed) throw new Error("Track not in playlist.");

    await tx.playlistTrack.delete({ where: { id: trackRowId } });

    // Renumber rows above the removed position so the sequence stays dense.
    await tx.playlistTrack.updateMany({
      where: { playlistId, position: { gt: removed.position } },
      data: { position: { decrement: 1 } },
    });

    await tx.playlist.update({
      where: { id: playlistId },
      data: { updatedAt: new Date() },
    });
  });
}

export async function moveTrack(
  userId: string,
  playlistId: string,
  trackRowId: string,
  newPosition: number,
): Promise<void> {
  if (!Number.isInteger(newPosition) || newPosition < 1) {
    throw new Error("Bad target position.");
  }
  await prisma.$transaction(async (tx) => {
    const playlist = await tx.playlist.findFirst({
      where: { id: playlistId, userId },
      select: { id: true },
    });
    if (!playlist) throw new Error("Playlist not found.");

    const row = await tx.playlistTrack.findFirst({
      where: { id: trackRowId, playlistId },
      select: { position: true },
    });
    if (!row) throw new Error("Track not in playlist.");

    const total = await tx.playlistTrack.count({ where: { playlistId } });
    const target = Math.min(newPosition, total);
    if (target === row.position) return;

    if (target < row.position) {
      // Moving up: rows in [target, row.position) shift down by 1.
      await tx.playlistTrack.updateMany({
        where: {
          playlistId,
          position: { gte: target, lt: row.position },
        },
        data: { position: { increment: 1 } },
      });
    } else {
      // Moving down: rows in (row.position, target] shift up by 1.
      await tx.playlistTrack.updateMany({
        where: {
          playlistId,
          position: { gt: row.position, lte: target },
        },
        data: { position: { decrement: 1 } },
      });
    }
    await tx.playlistTrack.update({
      where: { id: trackRowId },
      data: { position: target },
    });
    await tx.playlist.update({
      where: { id: playlistId },
      data: { updatedAt: new Date() },
    });
  });
}

// Heal ----------------------------------------------------------------------

/**
 * Resolve every row in a playlist to a current Lidarr trackFileId, healing
 * stale ids by re-walking the album's tracklist when the stored id is gone.
 *
 * Strategy:
 *   1. Group by albumMbid → at most one Lidarr roundtrip per album.
 *   2. Look up the LibraryItem (MBID first, artist+title fallback) → lidarrId.
 *   3. buildTrackFileLookup(lidarrId) → Map<albumPosition, trackFileId>.
 *   4. For each row, take map.get(row.albumPosition).
 *   5. Persist the new id back to the row when it differs from what we stored.
 *
 * Returns null for rows that couldn't be resolved (album gone from Lidarr,
 * track file missing, Lidarr unreachable). The UI greys those rows out.
 */
export async function resolvePlaylistTrackFiles(
  rows: Pick<PlaylistTrackRow, "id" | "albumMbid" | "albumPosition" | "trackFileId" | "artistName" | "albumTitle">[],
): Promise<Map<string, number | null>> {
  const out = new Map<string, number | null>();
  if (rows.length === 0) return out;

  const settings = await getSettings();
  if (!settings.lidarrUrl || !settings.lidarrApiKey) {
    for (const r of rows) out.set(r.id, null);
    return out;
  }
  const config: LidarrConfig = {
    url: settings.lidarrUrl,
    apiKey: settings.lidarrApiKey,
  };

  // Unique albums → fetch each one's track-file map exactly once.
  const albumKeys = new Map<
    string,
    { albumMbid: string; artistName: string; albumTitle: string | null }
  >();
  for (const r of rows) {
    if (!albumKeys.has(r.albumMbid)) {
      albumKeys.set(r.albumMbid, {
        albumMbid: r.albumMbid,
        artistName: r.artistName,
        albumTitle: r.albumTitle,
      });
    }
  }

  const albumLookups = new Map<string, Map<number, number> | null>();
  await Promise.all(
    Array.from(albumKeys.values()).map(async (info) => {
      try {
        const hit =
          (await getLibraryHit(info.albumMbid)) ??
          (info.albumTitle
            ? await getLibraryHitByName(info.artistName, info.albumTitle)
            : null);
        if (!hit) {
          albumLookups.set(info.albumMbid, null);
          return;
        }
        const lookup = await buildTrackFileLookup(config, hit.lidarrId);
        albumLookups.set(info.albumMbid, lookup);
      } catch {
        albumLookups.set(info.albumMbid, null);
      }
    }),
  );

  const updates: Array<{ id: string; trackFileId: number }> = [];
  for (const r of rows) {
    const lookup = albumLookups.get(r.albumMbid);
    const resolved = lookup?.get(r.albumPosition) ?? null;
    out.set(r.id, resolved);
    if (resolved !== null && resolved !== r.trackFileId) {
      updates.push({ id: r.id, trackFileId: resolved });
    }
  }

  // Heal: write back any newly-discovered trackFileIds. Not in a transaction —
  // a partial write here is harmless (next page load redoes the lookup).
  await Promise.all(
    updates.map((u) =>
      prisma.playlistTrack
        .update({ where: { id: u.id }, data: { trackFileId: u.trackFileId } })
        .catch(() => {
          /* ignore — row may have been deleted concurrently */
        }),
    ),
  );

  return out;
}
