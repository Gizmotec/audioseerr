import { prisma } from "@/lib/db";
import { isAdmin, type LibraryViewer } from "@/lib/userLibrary";

export type PlaylistSummary = {
  id: string;
  name: string;
  description: string | null;
  trackCount: number;
  coverUrls: string[];
  coverUrl: string | null;
  updatedAt: Date;
  isShared: boolean;
  ownerUsername: string | null;
  isOwner: boolean;
  system?: "liked-songs";
};

export type PlaylistTrackRow = {
  id: string;
  position: number;
  recordingMbid: string;
  trackFileId: number | null;
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
  coverUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  tracks: PlaylistTrackRow[];
  isShared: boolean;
  ownerUsername: string | null;
  isOwner: boolean;
  system?: "liked-songs";
};

export type AddTrackPayload = {
  recordingMbid: string;
  // Null when the track isn't in the Lidarr library — either it's one of our
  // own slskd downloads, or it hasn't been fetched yet (auto-fetch on add).
  trackFileId: number | null;
  albumMbid: string;
  albumPosition: number;
  title: string;
  artistName: string;
  albumTitle?: string | null;
  coverUrl?: string | null;
  durationMs?: number | null;
};

export type AvailablePlaylistTrack = AddTrackPayload & {
  key: string;
};

function coverUrlForReleaseGroup(mbid: string): string {
  return `https://coverartarchive.org/release-group/${mbid}/front-250`;
}

// CRUD ----------------------------------------------------------------------

export async function listPlaylists(userId: string): Promise<PlaylistSummary[]> {
  const rows = await prisma.playlist.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      description: true,
      coverUrl: true,
      updatedAt: true,
      isShared: true,
      tracks: {
        select: { albumMbid: true, coverUrl: true },
        orderBy: { position: "asc" },
        take: 24,
      },
      _count: { select: { tracks: true } },
    },
  });
  return rows.map((r) => summarizePlaylist(r, { isOwner: true, ownerUsername: null }));
}

/**
 * Lists playlists shared by *other* users. Used for the "Shared with you"
 * section on /playlists. Liked Songs is intentionally excluded (synthetic,
 * per-user collection that doesn't have an owner relation).
 */
export async function listSharedPlaylists(
  viewerUserId: string,
): Promise<PlaylistSummary[]> {
  const rows = await prisma.playlist.findMany({
    where: { isShared: true, userId: { not: viewerUserId } },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      description: true,
      coverUrl: true,
      updatedAt: true,
      isShared: true,
      user: { select: { username: true } },
      tracks: {
        select: { albumMbid: true, coverUrl: true },
        orderBy: { position: "asc" },
        take: 24,
      },
      _count: { select: { tracks: true } },
    },
  });
  return rows.map((r) =>
    summarizePlaylist(r, { isOwner: false, ownerUsername: r.user.username }),
  );
}

function summarizePlaylist(
  r: {
    id: string;
    name: string;
    description: string | null;
    coverUrl: string | null;
    updatedAt: Date;
    isShared: boolean;
    tracks: { albumMbid: string; coverUrl: string | null }[];
    _count: { tracks: number };
  },
  ctx: { isOwner: boolean; ownerUsername: string | null },
): PlaylistSummary {
  const coverUrls: string[] = [];
  const seen = new Set<string>();
  for (const track of r.tracks) {
    const url = track.coverUrl ?? coverUrlForReleaseGroup(track.albumMbid);
    if (seen.has(url)) continue;
    seen.add(url);
    coverUrls.push(url);
    if (coverUrls.length === 4) break;
  }

  return {
    id: r.id,
    name: r.name,
    description: r.description,
    trackCount: r._count.tracks,
    coverUrls,
    coverUrl: r.coverUrl ?? coverUrls[0] ?? null,
    updatedAt: r.updatedAt,
    isShared: r.isShared,
    isOwner: ctx.isOwner,
    ownerUsername: ctx.ownerUsername,
  };
}

export async function getPlaylist(
  viewerUserId: string,
  playlistId: string,
): Promise<PlaylistDetail | null> {
  const row = await prisma.playlist.findUnique({
    where: { id: playlistId },
    select: {
      id: true,
      userId: true,
      name: true,
      description: true,
      coverUrl: true,
      createdAt: true,
      updatedAt: true,
      isShared: true,
      user: { select: { username: true } },
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
  // Visibility: owner always sees their playlist; non-owner only when the
  // playlist is shared.
  const isOwner = row.userId === viewerUserId;
  if (!isOwner && !row.isShared) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    coverUrl: row.coverUrl,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    isShared: row.isShared,
    isOwner,
    ownerUsername: isOwner ? null : row.user.username,
    tracks: row.tracks.map((track) => ({
      ...track,
      coverUrl: track.coverUrl ?? coverUrlForReleaseGroup(track.albumMbid),
    })),
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

export async function getPlaylistCoverForUser(
  userId: string,
  playlistId: string,
): Promise<{ coverUrl: string | null } | null> {
  return prisma.playlist.findFirst({
    where: { id: playlistId, userId },
    select: { coverUrl: true },
  });
}

export async function setPlaylistCover(
  userId: string,
  playlistId: string,
  coverUrl: string,
): Promise<{ previousCoverUrl: string | null }> {
  const existing = await prisma.playlist.findFirst({
    where: { id: playlistId, userId },
    select: { id: true, coverUrl: true },
  });
  if (!existing) throw new Error("Playlist not found.");
  await prisma.playlist.update({
    where: { id: playlistId },
    data: { coverUrl },
  });
  return { previousCoverUrl: existing.coverUrl };
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

/**
 * Toggle the share flag on a playlist. Only the owner can change it.
 */
export async function setPlaylistShared(
  userId: string,
  playlistId: string,
  isShared: boolean,
): Promise<void> {
  const result = await prisma.playlist.updateMany({
    where: { id: playlistId, userId },
    data: { isShared },
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
        trackFileId: payload.trackFileId ?? null,
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

export async function addTracksToPlaylist(
  userId: string,
  playlistId: string,
  payloads: AddTrackPayload[],
): Promise<{ count: number }> {
  if (payloads.length === 0) return { count: 0 };
  if (payloads.length > 200) throw new Error("Too many tracks selected.");

  return prisma.$transaction(async (tx) => {
    const playlist = await tx.playlist.findFirst({
      where: { id: playlistId, userId },
      select: { id: true },
    });
    if (!playlist) throw new Error("Playlist not found.");

    const last = await tx.playlistTrack.findFirst({
      where: { playlistId },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    const start = last?.position ?? 0;

    await tx.playlistTrack.createMany({
      data: payloads.map((payload, idx) => ({
        playlistId,
        position: start + idx + 1,
        recordingMbid: payload.recordingMbid,
        trackFileId: payload.trackFileId ?? null,
        albumMbid: payload.albumMbid,
        albumPosition: payload.albumPosition,
        title: payload.title,
        artistName: payload.artistName,
        albumTitle: payload.albumTitle ?? null,
        coverUrl: payload.coverUrl ?? null,
        durationMs: payload.durationMs ?? null,
      })),
    });

    await tx.playlist.update({
      where: { id: playlistId },
      data: { updatedAt: new Date() },
    });

    return { count: payloads.length };
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

// Available tracks ----------------------------------------------------------

/**
 * Lists every track in our own library (DownloadedTrack), for the playlist
 * "Add songs" picker. recordingMbid falls back to a synthetic album:position key
 * for migrated tracks that lack one; the playlist resolves streamability by
 * (albumMbid, position) regardless.
 */
export async function listAvailablePlaylistTracks(
  viewer: LibraryViewer,
): Promise<AvailablePlaylistTrack[]> {
  if (!viewer) return [];
  const rows = await prisma.downloadedTrack.findMany({
    // ephemeral: false — temp discovery tracks aren't addable from the picker
    // until kept (adding one would graduate it anyway).
    where: {
      ephemeral: false,
      ...(isAdmin(viewer) ? {} : { users: { some: { userId: viewer.id } } }),
    },
    orderBy: [
      { artistName: "asc" },
      { albumTitle: "asc" },
      { albumPosition: "asc" },
    ],
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
  });

  return rows.map((r) => ({
    key: r.id,
    recordingMbid: r.recordingMbid ?? `${r.albumMbid}:${r.albumPosition}`,
    trackFileId: null,
    albumMbid: r.albumMbid,
    albumPosition: r.albumPosition,
    title: r.title,
    artistName: r.artistName,
    albumTitle: r.albumTitle,
    coverUrl: r.coverUrl ?? coverUrlForReleaseGroup(r.albumMbid),
    durationMs: r.durationMs,
  }));
}
